import { playingLength } from '../model/defaults'
import type { RulesProfile, Yd } from '../model/types'
import type { FieldView, RectYd } from './fieldTransform'

export type ViewOptions = {
  /** Most yards shown behind the ball. */
  behind: Yd
  /** Most yards shown ahead of the ball. */
  ahead: Yd
  /** Yards shown outside each sideline. */
  sidelineMargin: Yd
}

export const VIEW_DEFAULTS: ViewOptions = { behind: 12, ahead: 25, sidelineMargin: 1 }

const EPS = 1e-9

/**
 * The part of the field to draw for a ball spotted `ballOn` yards from the goal line.
 * Shows the full width, the backfield, and downfield, and never runs past the back of
 * either end zone.
 */
export function fieldView(
  ballOn: Yd,
  rules: RulesProfile,
  options: ViewOptions = VIEW_DEFAULTS,
): FieldView {
  const half = rules.fieldWidth / 2
  const toBackOfOwnEndZone = playingLength(rules) - ballOn + rules.endZoneDepth
  return {
    xMin: -half - options.sidelineMargin,
    xMax: half + options.sidelineMargin,
    yMin: -Math.min(options.behind, toBackOfOwnEndZone),
    yMax: Math.min(ballOn + rules.endZoneDepth, options.ahead),
  }
}

export type YardLine = {
  y: Yd
  /** The number painted on the field. */
  yardsFromGoal: Yd
}

export type FieldMarkings = {
  /** In-bounds turf inside the view, end zones included. */
  turf: RectYd
  /** The line of scrimmage is always y = 0, because the ball is the origin. */
  lineOfScrimmageY: Yd
  /** The goal line being attacked. Null when it is beyond the view. */
  goalLineY: Yd | null
  endZone: RectYd | null
  /** The offense's own goal line and end zone, behind the ball. */
  ownGoalLineY: Yd | null
  ownEndZone: RectYd | null
  noRunZone: RectYd | null
  /** Midfield, the first-down line. Null when out of view or the profile has no midfield first down. */
  midfieldY: Yd | null
  /** Every 5 yards, measured from the goal line. */
  yardLines: YardLine[]
  /**
   * The 1-yard snap grid. It is measured from the ball, not the goal line, because
   * players snap to whole yards from the ball. Skips lines that land on a yard line.
   */
  gridLines: Yd[]
}

/** The part of [lo, hi] that falls inside [min, max], or null when there is none. */
function clipSpan(lo: Yd, hi: Yd, min: Yd, max: Yd): { lo: Yd; hi: Yd } | null {
  const a = Math.max(lo, min)
  const b = Math.min(hi, max)
  return b > a ? { lo: a, hi: b } : null
}

/** Where every field marking sits, in yards, for the given view. */
export function fieldMarkings(ballOn: Yd, rules: RulesProfile, view: FieldView): FieldMarkings {
  const half = rules.fieldWidth / 2
  const length = playingLength(rules)
  const goalY = ballOn
  const ownGoalY = ballOn - length
  const midY = ballOn - length / 2
  const inView = (y: Yd) => y >= view.yMin - EPS && y <= view.yMax + EPS

  const band = (lo: Yd, hi: Yd): RectYd | null => {
    const span = clipSpan(lo, hi, view.yMin, view.yMax)
    return span && { x: -half, y: span.lo, width: rules.fieldWidth, height: span.hi - span.lo }
  }

  const turf = band(ownGoalY - rules.endZoneDepth, goalY + rules.endZoneDepth) ?? {
    x: -half,
    y: view.yMin,
    width: rules.fieldWidth,
    height: 0,
  }

  const yardLines: YardLine[] = []
  for (let d = 5; d < length; d += 5) {
    if (inView(goalY - d)) yardLines.push({ y: goalY - d, yardsFromGoal: d })
  }

  const gridLines: Yd[] = []
  const from = Math.ceil(Math.max(view.yMin, ownGoalY) - EPS)
  const to = Math.floor(Math.min(view.yMax, goalY) + EPS)
  for (let y = from; y <= to; y += 1) {
    const fromGoal = goalY - y
    const onYardLine = Math.abs(fromGoal / 5 - Math.round(fromGoal / 5)) < EPS
    if (!onYardLine) gridLines.push(y)
  }

  return {
    turf,
    lineOfScrimmageY: 0,
    goalLineY: inView(goalY) ? goalY : null,
    endZone: band(goalY, goalY + rules.endZoneDepth),
    ownGoalLineY: inView(ownGoalY) ? ownGoalY : null,
    ownEndZone: band(ownGoalY - rules.endZoneDepth, ownGoalY),
    noRunZone: rules.noRunZone > 0 ? band(goalY - rules.noRunZone, goalY) : null,
    midfieldY: rules.firstDownAtMidfield && inView(midY) ? midY : null,
    yardLines,
    gridLines,
  }
}
