import { GRID, playingLength } from '../model/defaults'
import type { Point, RulesProfile, Yd } from '../model/types'
import { VIEW_DEFAULTS } from './fieldLayout'

/** Rounds to the grid. Never returns -0. */
export const snap = (value: Yd, grid: Yd = GRID): Yd => Math.round(value / grid) * grid + 0

export const snapPoint = (p: Point, grid: Yd = GRID): Point => ({ x: snap(p.x, grid), y: snap(p.y, grid) })

/** Flips left and right. Mirroring a play applies this to every start and waypoint. */
export const mirrorPoint = (p: Point): Point => ({ x: -p.x + 0, y: p.y })

export type Bounds = { xMin: Yd; xMax: Yd; yMin: Yd; yMax: Yd }

/**
 * Where a player may line up: between the sidelines, at least a yard behind the line of
 * scrimmage, and no deeper than the visible backfield or the back of their own end zone.
 */
export function lineupBounds(ballOn: Yd, rules: RulesProfile): Bounds {
  const half = Math.floor(rules.fieldWidth / 2)
  const toBackOfOwnEndZone = playingLength(rules) - ballOn + rules.endZoneDepth
  const deepest = Math.floor(Math.min(VIEW_DEFAULTS.behind, toBackOfOwnEndZone)) - 1
  return { xMin: -half, xMax: half, yMin: -Math.max(1, deepest), yMax: -1 }
}

/** The whole field, back of one end zone to the back of the other. Routes stay inside it. */
export function fieldBounds(ballOn: Yd, rules: RulesProfile): Bounds {
  const half = rules.fieldWidth / 2
  return {
    xMin: -half,
    xMax: half,
    yMin: -(playingLength(rules) - ballOn + rules.endZoneDepth),
    yMax: ballOn + rules.endZoneDepth,
  }
}

/** The on-grid, in-bounds spot nearest a click, for a route waypoint. */
export const waypointSpot = (p: Point, ballOn: Yd, rules: RulesProfile): Point =>
  clampPoint(snapPoint(p), fieldBounds(ballOn, rules))

export const clampPoint =(p: Point, b: Bounds): Point => ({
  x: Math.min(b.xMax, Math.max(b.xMin, p.x)),
  y: Math.min(b.yMax, Math.max(b.yMin, p.y)),
})

/** The legal, on-grid spot nearest to where a player was dropped. */
export const lineupSpot = (p: Point, ballOn: Yd, rules: RulesProfile): Point =>
  clampPoint(snapPoint(p), lineupBounds(ballOn, rules))
