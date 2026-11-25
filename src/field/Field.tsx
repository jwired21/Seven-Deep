import { useState, type CSSProperties, type PointerEvent } from 'react'
import { fieldView } from '../geometry/fieldLayout'
import { createFieldTransform } from '../geometry/fieldTransform'
import { lineupSpot, waypointSpot } from '../geometry/snap'
import type { Point } from '../model/types'
import { useEditor } from '../store/editorStore'
import { FieldSvg } from './FieldSvg'
import { PlayersLayer } from './PlayersLayer'
import { RoutesLayer } from './RoutesLayer'
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

  /** While drawing freehand: the snapped spot under the pointer, in yards. */
  const [preview, setPreview] = useState<Point | null>(null)

  const view = fieldView(play.ballOn, rules)
  // The same transform FieldSvg builds, used here to turn pointer positions into yards.
  const transform = createFieldTransform(view, size)

  const pointerYd = (e: PointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect()
    return transform.toYd({ x: e.clientX - box.left, y: e.clientY - box.top })
  }

  const onBackgroundPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (readOnly) return
    if (drawingFor) {
      if (e.button === 0) addWaypoint(pointerYd(e))
    } else {
      select(null)
    }
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawingFor) return
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
      >
        {(t) => (
          <>
            <RoutesLayer
              play={play}
              transform={t}
              drawingFor={drawingFor}
              drawingSlot={drawingSlot}
              preview={drawingFor ? preview : null}
            />
            <PlayersLayer
              players={play.players}
              transform={t}
              selectedId={readOnly ? null : selectedId}
              readOnly={readOnly}
              onSelect={select}
              onMove={movePlayer}
              constrain={(p) => lineupSpot(p, play.ballOn, rules)}
            />
          </>
        )}
      </FieldSvg>
    </div>
  )
}
