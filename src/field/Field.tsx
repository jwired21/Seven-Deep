import { useState, type CSSProperties, type PointerEvent } from 'react'
import { fieldView } from '../geometry/fieldLayout'
import { createFieldTransform } from '../geometry/fieldTransform'
import { lineupSpot, waypointSpot } from '../geometry/snap'
import type { Point } from '../model/types'
import { usePlayback, useTimeline } from '../playback/playbackStore'
import { getAssignment } from '../routes/assignments'
import { useEditor } from '../store/editorStore'
import { moveTrace } from '../trace/trace'
import { TraceLayer } from '../trace/TraceLayer'
import { updateTrace, useTrace } from '../trace/traceStore'
import { FIELD_COLORS } from './fieldColors'
import { FieldSvg } from './FieldSvg'
import { PlayersLayer } from './PlayersLayer'
import { RoutesLayer, routeStroke } from './RoutesLayer'
import { useElementSize } from './useElementSize'

/** Measures the space it is given and draws the field, routes, and players to fit, at any window size. */
export function Field({ readOnly = false }: { readOnly?: boolean }) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const play = useEditor((s) => s.play)
  const rules = useEditor((s) => s.rules)
  const selectedId = useEditor((s) => s.selectedId)
  const drawingFor = useEditor((s) => s.drawingFor)
  const drawingSlot = useEditor((s) => s.drawingSlot)
  const select = useEditor((s) => s.select)
  const movePlayer = useEditor((s) => s.movePlayer)
  const addWaypoint = useEditor((s) => s.addWaypoint)
  const addStroke = useEditor((s) => s.addStroke)
  const drawingStyle = useEditor((s) => s.drawingStyle)

  // Playback: once it is running or scrubbed, players and the ball are drawn where the
  // timeline puts them, and nobody can be dragged until it is reset.
  const timeline = useTimeline()
  const playbackActive = usePlayback((s) => s.active)
  const playbackTime = usePlayback((s) => s.time)
  const locked = readOnly || playbackActive
  const time = Math.min(timeline.end, Math.max(timeline.start, playbackTime))
  const positions = playbackActive ? new Map(play.players.map((p) => [p.id, timeline.positionOf(p.id, time)])) : undefined
  const ball = playbackActive ? timeline.ball(time) : null

  // A picture to trace over. Only the editor shows it, never view mode.
  const traceState = useTrace()
  const trace = !readOnly && !traceState.hidden ? traceState.trace : null
  const adjustingTrace = trace !== null && traceState.adjusting

  /** Tapping a receiver chooses who the ball goes to. */
  const pickTarget = (id: string) => {
    const a = getAssignment(play, id)
    if (a?.kind === 'route' && a.path.length > 0) useEditor.getState().setPassTo(id)
  }

  /** While drawing freehand: the snapped spot under the pointer, in yards. */
  const [preview, setPreview] = useState<Point | null>(null)

  const view = fieldView(play.ballOn, rules)
  // The same transform FieldSvg builds, used here to turn pointer positions into yards.
  const transform = createFieldTransform(view, size)

  const pointerYd = (e: PointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect()
    return transform.toYd({ x: e.clientX - box.left, y: e.clientY - box.top })
  }

  /** While a line is being drawn by hand: where the pointer has been so far, in yards. */
  const [stroke, setStroke] = useState<Point[] | null>(null)

  /**
   * While drawing a path, a press on the field depends on the drawing style. Straight:
   * it adds a waypoint, snapped to the grid. Curved: a drag draws the line the pointer
   * follows, curves and loops included. The line is held here until release, then
   * committed once, so one stroke is one undo step.
   */
  const startStroke = (e: PointerEvent<SVGSVGElement>) => {
    if (drawingStyle === 'points') {
      addWaypoint(pointerYd(e))
      return
    }
    const svg = e.currentTarget
    const toYd = (ev: { clientX: number; clientY: number }) => {
      const box = svg.getBoundingClientRect()
      return transform.toYd({ x: ev.clientX - box.left, y: ev.clientY - box.top })
    }
    const start = toYd(e)
    const points = [start]
    // A press that wanders less than this is a click, not a line: 6 px, or 0.4 yd if that is more.
    const slop = Math.max(0.4, transform.scale > 0 ? 6 / transform.scale : 0)
    let drawn = false

    const move = (ev: globalThis.PointerEvent) => {
      const at = toYd(ev)
      const last = points[points.length - 1]
      if (Math.hypot(at.x - last.x, at.y - last.y) < 0.05) return
      points.push(at)
      if (!drawn && Math.hypot(at.x - start.x, at.y - start.y) > slop) drawn = true
      if (drawn) setStroke([...points])
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      setStroke(null)
    }
    const up = () => {
      stop()
      if (drawn) addStroke(points)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
  }

  const onBackgroundPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (locked) return
    if (drawingFor) {
      if (e.button === 0) startStroke(e)
    } else {
      select(null)
    }
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    // Only straight pieces show where the next point would land.
    if (!drawingFor || drawingStyle !== 'points') {
      if (preview) setPreview(null)
      return
    }
    // Motion stays behind the line of scrimmage. Everything else can go anywhere on the field.
    const snapTo = drawingSlot === 'motion' ? lineupSpot : waypointSpot
    const spot = snapTo(pointerYd(e), play.ballOn, rules)
    if (spot.x !== preview?.x || spot.y !== preview?.y) setPreview(spot)
  }

  // Used by the narrow layout, where the page scrolls and the field sets its own height.
  const style = {
    '--field-ratio': `${view.xMax - view.xMin} / ${view.yMax - view.yMin}`,
  } as CSSProperties

  return (
    <div ref={ref} className={drawingFor ? 'field drawing' : 'field'} style={style}>
      <FieldSvg
        ballOn={play.ballOn}
        rules={rules}
        width={size.width}
        height={size.height}
        onBackgroundPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setPreview(null)}
        showBall={!playbackActive}
      >
        {(t) => (
          <>
            {trace && !adjustingTrace && <TraceLayer trace={trace} transform={t} />}
            <RoutesLayer
              play={play}
              transform={t}
              drawingFor={drawingFor}
              drawingSlot={drawingSlot}
              preview={drawingFor && drawingStyle === 'points' ? preview : null}
            />
            {stroke && stroke.length > 1 && (
              <polyline
                data-part="stroke"
                points={stroke.map((p) => t.toPx(p)).map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={play.players.find((p) => p.id === drawingFor)?.color ?? '#FFFFFF'}
                strokeWidth={routeStroke(t.scale)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            <PlayersLayer
              players={play.players}
              transform={t}
              selectedId={locked ? null : selectedId}
              readOnly={locked}
              passThroughId={locked ? null : drawingFor}
              positions={positions}
              onPick={locked ? pickTarget : undefined}
              targetId={locked ? timeline.targetId : null}
              onSelect={select}
              onMove={movePlayer}
              constrain={(p) => lineupSpot(p, play.ballOn, rules)}
            />
            {/* While it is being lined up the picture sits on top, so a drag anywhere on it moves it. */}
            {trace && adjustingTrace && (
              <TraceLayer
                trace={trace}
                transform={t}
                adjusting
                onMove={(center) => updateTrace((tr) => moveTrace(tr, center, view))}
              />
            )}
            {ball && (
              <ellipse
                data-part="live-ball"
                cx={t.toPx(ball.at).x}
                cy={t.toPx(ball.at).y}
                // A thrown ball grows a little at the top of its arc, as if coming toward you.
                rx={Math.max(3, t.len(0.32)) * (1 + ball.height * 0.7)}
                ry={Math.max(4.5, t.len(0.5)) * (1 + ball.height * 0.7)}
                fill={FIELD_COLORS.ball}
                stroke={FIELD_COLORS.line}
                strokeWidth={1.25}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </>
        )}
      </FieldSvg>
    </div>
  )
}
