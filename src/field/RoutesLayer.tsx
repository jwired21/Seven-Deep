import type { FieldTransform } from '../geometry/fieldTransform'
import type { Vec } from '../geometry/path'
import type { Play, Point } from '../model/types'
import { slotOf, type Slot } from '../routes/assignments'
import { routeShapes } from '../routes/routeShapes'

const BODY_FONT = "'Inter Variable', Inter, system-ui, sans-serif"

type Props = {
  play: Play
  transform: FieldTransform
  /** The player whose freehand path is being drawn, if any, and which slot it is. */
  drawingFor?: string | null
  drawingSlot?: Slot
  /** Where the next freehand waypoint would land, in yards. */
  preview?: Point | null
}

const toD = (points: Vec[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('')
const toPoints = (points: Vec[]) => points.map((p) => `${p.x},${p.y}`).join(' ')

/** True for a spot on the whole-yard grid, where clicked waypoints land. */
const onGrid = (p: Point) => Math.abs(p.x - Math.round(p.x)) < 0.004 && Math.abs(p.y - Math.round(p.y)) < 0.004

/** Line weight in pixels: lighter on a phone so seven paths stay readable. */
export const routeStroke = (scale: number) => Math.min(3.5, Math.max(2.25, scale * 0.2))

/** Label size in pixels. */
export const routeLabelSize = (scale: number) => Math.min(12, Math.max(9, scale * 0.7))

/**
 * Everything the players do, drawn in each player's color:
 * - route or run: a solid line with an arrowhead. The QB's first read is drawn heavier,
 *   and each read shows its number at the end.
 * - delayed release: a dotted first stretch and a "delay N" label.
 * - motion: a thin dashed line behind the line of scrimmage, ending in a ring where the player sets.
 * - QB run if blitzed: a dashed line with an arrowhead and a label.
 * - handoff: a thin line from the player handing off to a ring on the carrier's path.
 * The geometry comes from routeShapes(), which the PDF uses too.
 * Drawn under the players and ignores the pointer, so it never blocks a drag.
 */
export function RoutesLayer({ play, transform: t, drawingFor = null, drawingSlot = 'main', preview = null }: Props) {
  const stroke = routeStroke(t.scale)
  const labelSize = routeLabelSize(t.scale)
  const { paths, handoffs } = routeShapes(play, t, stroke, labelSize)

  const text = { fontFamily: BODY_FONT, fontSize: labelSize, fill: '#FFFFFF', stroke: 'none' }

  return (
    <g data-part="routes" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
      {handoffs.map((h) => (
        <g key={`${h.player.id}-handoff`} data-handoff={h.player.label} stroke={h.player.color} strokeWidth={h.width}>
          <path d={toD([h.from, h.to])} />
          <circle cx={h.to.x} cy={h.to.y} r={h.ring.radius} fill="#12161C" strokeWidth={h.ring.width} />
          <text {...text} x={h.label.at.x} y={h.label.at.y} textAnchor="middle">
            {h.label.text}
          </text>
        </g>
      ))}

      {paths.map((shape) => {
        const { player, points } = shape
        const end = points[points.length - 1]
        const drawing = drawingFor === player.id && drawingSlot === slotOf(shape.kind)
        const previewPx = drawing && preview ? t.toPx(preview) : null

        return (
          <g
            key={`${player.id}-${shape.kind}`}
            data-route={player.label}
            data-kind={shape.kind}
            stroke={player.color}
            strokeWidth={shape.width}
          >
            {shape.wait.length > 1 && (
              <path data-part="delay" d={toD(shape.wait)} strokeDasharray={shape.waitDash.join(' ')} />
            )}
            {shape.run.length > 1 && <path d={toD(shape.run)} strokeDasharray={shape.dash?.join(' ')} />}
            {shape.head && <polygon data-part="arrow" points={toPoints(shape.head)} fill={player.color} stroke="none" />}

            {shape.setRing && (
              <circle
                data-part="set"
                cx={shape.setRing.at.x}
                cy={shape.setRing.at.y}
                r={shape.setRing.radius}
                strokeWidth={shape.setRing.width}
              />
            )}

            {shape.delayLabel && (
              <text {...text} x={shape.delayLabel.at.x} y={shape.delayLabel.at.y}>
                {shape.delayLabel.text}
              </text>
            )}
            {shape.note && (
              <text {...text} x={shape.note.at.x} y={shape.note.at.y}>
                {shape.note.text}
              </text>
            )}
            {shape.readLabel && (
              <text
                data-part="read"
                x={shape.readLabel.at.x}
                y={shape.readLabel.at.y + labelSize * 0.4}
                textAnchor="middle"
                fontFamily={BODY_FONT}
                fontSize={labelSize * 1.15}
                fontWeight={700}
                fill={player.color}
                stroke="none"
              >
                {shape.readLabel.text}
              </text>
            )}

            {drawing &&
              points.slice(1).map((p, i) =>
                // A dot on each clicked waypoint, which sits on the grid, and on the end.
                // The off-grid points of a hand-drawn line get none.
                onGrid(t.toYd(p)) || i === points.length - 2 ? (
                  <circle key={i} cx={p.x} cy={p.y} r={stroke * 1.1} fill={player.color} stroke="none" />
                ) : null,
              )}

            {previewPx && (previewPx.x !== end.x || previewPx.y !== end.y) && (
              <>
                <path
                  data-part="preview"
                  d={toD([end, previewPx])}
                  strokeWidth={stroke * 0.7}
                  strokeOpacity={0.7}
                  strokeDasharray={`${stroke * 1.5} ${stroke * 2}`}
                />
                <circle cx={previewPx.x} cy={previewPx.y} r={stroke * 1.4} strokeWidth={1.5} strokeOpacity={0.9} />
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}
