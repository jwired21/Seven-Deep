import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { FieldTransform } from '../geometry/fieldTransform'
import { describeSpot, POSITION_NAMES } from '../model/players'
import type { Player, Point } from '../model/types'

const INK = '#12161C'
const ACCENT = '#FF8A3D'
const DISPLAY_FONT = "'Space Grotesk Variable', 'Space Grotesk', system-ui, sans-serif"

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
}

type Props = {
  players: Player[]
  transform: FieldTransform
  selectedId: string | null
  onSelect(id: string): void
  /** Called once, when a drag ends or an arrow key is pressed. */
  onMove(id: string, to: Point): void
  /** The legal, on-grid spot nearest a point. Used to preview where a drag will land. */
  constrain(p: Point): Point
  /** Show the players without letting them be picked up or moved, for the view mode. */
  readOnly?: boolean
}

type Drag = {
  id: string
  /** Where the player will land, in yards. */
  spot: Point
  /** Pointer position minus player position at grab time, in yards, so the player does not jump. */
  grab: Point
  /** The field the drag started on, for turning pointer positions into yards. */
  svg: SVGSVGElement
}

/** Radius of a player marker in pixels: to scale on a big screen, never too small to read. */
export const playerRadius = (scale: number) => Math.min(16, Math.max(9, scale * 0.85))

/**
 * The seven players. Dragging shows a live, snapped preview held in local state and
 * commits once on release, so one drag is one undo step.
 */
export function PlayersLayer({ players, transform: t, selectedId, onSelect, onMove, constrain, readOnly = false }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null)

  const r = playerRadius(t.scale)
  // Fingers need a bigger target than the drawn marker.
  const hitR = Math.max(r, 20)

  // The drag in progress and the latest props, readable from the window listeners below.
  const dragRef = useRef<Drag | null>(null)
  const latest = useRef({ t, constrain, onMove })
  latest.current = { t, constrain, onMove }

  const dragging = drag !== null

  // Follow the pointer on the window, not the marker, so a fast drag cannot outrun it.
  useEffect(() => {
    if (!dragging) return

    const onPointerMove = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const box = current.svg.getBoundingClientRect()
      const at = latest.current.t.toYd({ x: e.clientX - box.left, y: e.clientY - box.top })
      const spot = latest.current.constrain({ x: at.x - current.grab.x, y: at.y - current.grab.y })
      if (spot.x === current.spot.x && spot.y === current.spot.y) return
      dragRef.current = { ...current, spot }
      setDrag(dragRef.current)
    }

    const finish = (commit: boolean) => () => {
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (commit && current) latest.current.onMove(current.id, current.spot)
    }
    const onPointerUp = finish(true)
    const onPointerCancel = finish(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [dragging])

  const onPointerDown = (player: Player) => (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    e.stopPropagation()
    onSelect(player.id)
    const box = svg.getBoundingClientRect()
    const at = t.toYd({ x: e.clientX - box.left, y: e.clientY - box.top })
    dragRef.current = {
      id: player.id,
      spot: player.start,
      grab: { x: at.x - player.start.x, y: at.y - player.start.y },
      svg,
    }
    setDrag(dragRef.current)
  }

  const onKeyDown = (player: Player) => (e: KeyboardEvent<SVGGElement>) => {
    const step = ARROWS[e.key]
    if (!step) return
    e.preventDefault()
    onMove(player.id, { x: player.start.x + step.x, y: player.start.y + step.y })
  }

  // Draw the selected player last so it sits on top of its neighbors.
  const ordered = [...players].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))

  return (
    <g data-part="players" fontFamily={DISPLAY_FONT} fontWeight={700} textAnchor="middle">
      {ordered.map((player) => {
        const held = drag?.id === player.id
        const spot = held ? drag.spot : player.start
        const { x, y } = t.toPx(spot)
        const selected = player.id === selectedId
        const isCenter = player.label === 'C'
        const name = POSITION_NAMES[player.label] ?? 'Player'

        return (
          <g
            key={player.id}
            data-player={player.label}
            className="player"
            transform={`translate(${x} ${y})`}
            {...(readOnly
              ? {
                  role: 'img',
                  'aria-label': `${player.label}, ${name}. ${describeSpot(spot)}.`,
                  // Let a swipe that starts on a player pass through to the viewer.
                  style: { pointerEvents: 'none' as const },
                }
              : {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${player.label}, ${name}. ${describeSpot(spot)}. Drag or use arrow keys to move.`,
                  'aria-pressed': selected,
                  style: { cursor: held ? 'grabbing' : 'grab', touchAction: 'none' as const },
                  onPointerDown: onPointerDown(player),
                  onFocus: () => onSelect(player.id),
                  onKeyDown: onKeyDown(player),
                })}
          >
            <circle r={hitR} fill="transparent" />
            {selected && (
              <rect
                x={-r - 5}
                y={-r - 5}
                width={(r + 5) * 2}
                height={(r + 5) * 2}
                rx={isCenter ? 6 : r + 5}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            )}
            {isCenter ? (
              <rect x={-r * 0.93} y={-r * 0.93} width={r * 1.86} height={r * 1.86} rx={3} fill={player.color} />
            ) : (
              <circle r={r} fill={player.color} />
            )}
            <text
              y={r * 0.3}
              fontSize={r * (player.label.length > 1 ? 0.8 : 0.9)}
              fill={INK}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {player.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
