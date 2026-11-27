import { FIELD_COLORS } from './fieldColors'
import { fieldMarkings, fieldView } from '../geometry/fieldLayout'
import type { PointerEventHandler, ReactNode } from 'react'
import { createFieldTransform, type FieldTransform } from '../geometry/fieldTransform'
import { formatYd } from '../model/format'
import type { RulesProfile, Yd } from '../model/types'


const DISPLAY_FONT = "'Space Grotesk Variable', 'Space Grotesk', system-ui, sans-serif"

type Props = {
  /** Yards from the goal line. */
  ballOn: Yd
  rules: RulesProfile
  /** Size of the drawing area in pixels. */
  width: number
  height: number
  /** Drawn on top of the field markings, with the same yards-to-pixels transform. */
  children?: (transform: FieldTransform) => ReactNode
  /** A press on the field itself, not on anything drawn on top of it. */
  onBackgroundPointerDown?: PointerEventHandler<SVGSVGElement>
  onPointerMove?: PointerEventHandler<SVGSVGElement>
  onPointerLeave?: PointerEventHandler<SVGSVGElement>
  /** Draw the ball at rest on the line of scrimmage. Off while playback draws a moving one. */
  showBall?: boolean
}

/**
 * The field, drawn to scale. Takes yards in, converts to pixels here and nowhere else.
 * Pure: the same props always give the same SVG, so it can be rendered in tests.
 */
export function FieldSvg({
  ballOn,
  rules,
  width,
  height,
  children,
  onBackgroundPointerDown,
  onPointerMove,
  onPointerLeave,
  showBall = true,
}: Props) {
  const view = fieldView(ballOn, rules)
  const t = createFieldTransform(view, { width, height })
  const m = fieldMarkings(ballOn, rules, view)

  const label = `Field, ${rules.fieldWidth} yards wide, ball on the ${formatYd(ballOn)} yard line`

  if (t.scale <= 0) {
    return <svg className="field-svg" width={width} height={height} role="img" aria-label={label} />
  }

  const half = rules.fieldWidth / 2
  const turf = t.rectToPx(m.turf)
  const left = t.toPx({ x: -half, y: 0 }).x
  const right = t.toPx({ x: half, y: 0 }).x
  const yPx = (y: Yd) => t.toPx({ x: 0, y }).y
  const hLine = (y: Yd) => `M${left} ${yPx(y)}H${right}`

  // Text and strokes follow the scale but stay readable on a phone and sane on a big monitor.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const fontPx = clamp(t.scale * 0.8, 9, 14)
  const pad = clamp(t.scale * 0.6, 4, 12)
  const showGrid = t.scale >= 7

  const endZone = m.endZone && t.rectToPx(m.endZone)
  const ownEndZone = m.ownEndZone && t.rectToPx(m.ownEndZone)
  const noRun = m.noRunZone && t.rectToPx(m.noRunZone)
  const ball = t.toPx({ x: 0, y: 0 })

  return (
    <svg
      className="field-svg"
      width={width}
      height={height}
      role="group"
      aria-label={label}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <defs>
        <clipPath id="field-view-clip">
          <rect {...t.viewPx} rx={12} />
        </clipPath>
      </defs>

      <g clipPath="url(#field-view-clip)">
        <rect data-part="apron" {...t.viewPx} fill={FIELD_COLORS.apron} />
        <rect data-part="turf" {...turf} fill={FIELD_COLORS.turf} />

        {endZone && (
          <>
            <rect data-part="end-zone" {...endZone} fill={FIELD_COLORS.endZone} />
            {endZone.height >= fontPx * 2.2 && (
              <text
                x={endZone.x + endZone.width / 2}
                y={endZone.y + endZone.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={DISPLAY_FONT}
                fontSize={fontPx * 1.3}
                letterSpacing={fontPx * 0.5}
                fill={FIELD_COLORS.line}
                fillOpacity={0.6}
              >
                END ZONE
              </text>
            )}
          </>
        )}

        {ownEndZone && <rect data-part="own-end-zone" {...ownEndZone} fill={FIELD_COLORS.endZone} />}

        {noRun && (
          <rect data-part="no-run-zone" {...noRun} fill={FIELD_COLORS.noRunZone} opacity={0.28} />
        )}

        {showGrid && (
          <path
            data-part="grid"
            d={m.gridLines.map(hLine).join('')}
            stroke={FIELD_COLORS.line}
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        )}

        <path
          data-part="yard-lines"
          d={m.yardLines.map((l) => hLine(l.y)).join('')}
          stroke={FIELD_COLORS.line}
          strokeOpacity={0.35}
          strokeWidth={1.5}
        />

        <path
          data-part="sidelines"
          d={`M${left} ${turf.y}V${turf.y + turf.height}M${right} ${turf.y}V${turf.y + turf.height}`}
          stroke={FIELD_COLORS.line}
          strokeOpacity={0.7}
          strokeWidth={2}
        />

        {m.goalLineY !== null && (
          <path
            data-part="goal-line"
            d={hLine(m.goalLineY)}
            stroke={FIELD_COLORS.line}
            strokeOpacity={0.9}
            strokeWidth={3}
          />
        )}

        {m.ownGoalLineY !== null && (
          <path
            data-part="own-goal-line"
            d={hLine(m.ownGoalLineY)}
            stroke={FIELD_COLORS.line}
            strokeOpacity={0.9}
            strokeWidth={3}
          />
        )}

        {m.midfieldY !== null && (
          <path
            data-part="midfield"
            d={hLine(m.midfieldY)}
            stroke={FIELD_COLORS.firstDown}
            strokeOpacity={0.9}
            strokeWidth={2.5}
          />
        )}

        <path
          data-part="line-of-scrimmage"
          d={hLine(m.lineOfScrimmageY)}
          stroke={FIELD_COLORS.scrimmage}
          strokeWidth={2}
          strokeDasharray="2 6"
        />

        <g fontFamily={DISPLAY_FONT} fontSize={fontPx} fill={FIELD_COLORS.line}>
          {m.yardLines.map((l) => (
            <text key={l.yardsFromGoal} x={left + pad} y={yPx(l.y) - pad * 0.5} fillOpacity={0.6}>
              {l.yardsFromGoal}
            </text>
          ))}

          {noRun && noRun.height >= fontPx * 1.6 && (
            <text x={left + pad} y={noRun.y + pad * 0.5} dominantBaseline="hanging" fillOpacity={0.95}>
              NO-RUN ZONE · {formatYd(rules.noRunZone)} YD
            </text>
          )}

          <text
            x={right - pad}
            y={yPx(0) - pad * 0.6}
            textAnchor="end"
            fill={FIELD_COLORS.scrimmage}
          >
            BALL ON THE {formatYd(ballOn)}
          </text>

          {m.midfieldY !== null && (
            <text
              x={right - pad}
              y={yPx(m.midfieldY) + pad * 0.6}
              textAnchor="end"
              dominantBaseline="hanging"
              fill={FIELD_COLORS.firstDown}
            >
              MIDFIELD · FIRST DOWN
            </text>
          )}
        </g>

        {showBall && (
        <ellipse
          data-part="ball"
          cx={ball.x}
          cy={ball.y}
          rx={Math.max(2.5, t.len(0.3))}
          ry={Math.max(4, t.len(0.5))}
          fill={FIELD_COLORS.ball}
          stroke={FIELD_COLORS.line}
          strokeOpacity={0.8}
          strokeWidth={1}
        />
        )}
      </g>

      {children?.(t)}
    </svg>
  )
}
