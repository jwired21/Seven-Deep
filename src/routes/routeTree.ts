import { clampPoint, type Bounds } from '../geometry/snap'
import type { Point, Yd } from '../model/types'

export type RouteId =
  | 'slant' | 'out' | 'in' | 'hitch' | 'corner' | 'post' | 'go' | 'wheel'
  | 'dive' | 'offTackle' | 'sweep'
  | 'roll' | 'stepUp'

/** What a template is for. It becomes the assignment's kind. */
export type TemplateKind = 'route' | 'run' | 'qbRunIfBlitzed'

/**
 * One waypoint of a template.
 * `x` is in "outside" yards: positive is toward the player's sideline, negative is toward the middle.
 * `y` is measured either from the line of scrimmage, so every receiver breaks at the same
 * depth however far off the ball they line up, or from the player's own start.
 */
type TemplatePoint = { x: Yd; y: Yd; from: 'los' | 'start' }

export type RouteTemplate = {
  id: RouteId
  kind: TemplateKind
  name: string
  /** Depth of the break, in yards past the line of scrimmage. */
  defaultDepth: Yd
  minDepth: Yd
  points(depth: Yd): TemplatePoint[]
}

export const MAX_ROUTE_DEPTH: Yd = 30

const los = (x: Yd, y: Yd): TemplatePoint => ({ x, y, from: 'los' })
const start = (x: Yd, y: Yd): TemplatePoint => ({ x, y, from: 'start' })

/** The pass routes. */
export const ROUTE_TREE: RouteTemplate[] = (
  [
  // Short stem, then a sharp angle to the middle.
  { id: 'slant', name: 'Slant', defaultDepth: 2, minDepth: 1, points: (d) => [los(0, d), los(-5, d + 4)] },
  // Straight up, square cut to the sideline.
  { id: 'out', name: 'Out', defaultDepth: 5, minDepth: 1, points: (d) => [los(0, d), los(5, d)] },
  // Straight up, square cut to the middle.
  { id: 'in', name: 'In', defaultDepth: 5, minDepth: 1, points: (d) => [los(0, d), los(-6, d)] },
  // Straight up, stop, and come back to the QB.
  { id: 'hitch', name: 'Hitch', defaultDepth: 5, minDepth: 2, points: (d) => [los(0, d), los(-1, d - 1)] },
  // Straight up, then break to the back corner.
  { id: 'corner', name: 'Corner', defaultDepth: 7, minDepth: 1, points: (d) => [los(0, d), los(5, d + 5)] },
  // Straight up, then break to the goal post.
  { id: 'post', name: 'Post', defaultDepth: 7, minDepth: 1, points: (d) => [los(0, d), los(-4, d + 6)] },
  // Straight up the field.
  { id: 'go', name: 'Go', defaultDepth: 12, minDepth: 1, points: (d) => [los(0, d)] },
  // Out to the flat first, then turn up the sideline.
  { id: 'wheel', name: 'Wheel', defaultDepth: 12, minDepth: 3, points: (d) => [start(3, 0), start(5, 2), los(5, d)] },
  ] as Omit<RouteTemplate, 'kind'>[]
).map((route) => ({ ...route, kind: 'route' }))

/** Paths for a ball carrier. Depth is how far past the line of scrimmage the path is drawn. */
export const RUN_PATHS: RouteTemplate[] = [
  // Straight ahead.
  { id: 'dive', kind: 'run', name: 'Dive', defaultDepth: 4, minDepth: 1, points: (d) => [los(0, d)] },
  // Angle to the line a few yards outside, then straight up.
  { id: 'offTackle', kind: 'run', name: 'Off tackle', defaultDepth: 4, minDepth: 1, points: (d) => [los(3, 0), los(3, d)] },
  // Flat toward the sideline, then turn the corner.
  { id: 'sweep', kind: 'run', name: 'Sweep', defaultDepth: 5, minDepth: 1, points: (d) => [start(6, 0), start(9, 2), los(10, d)] },
]

/** Where the QB goes when the defense blitzes. */
export const BLITZ_RUNS: RouteTemplate[] = [
  // Roll out to one side, then turn upfield.
  { id: 'roll', kind: 'qbRunIfBlitzed', name: 'Roll out', defaultDepth: 2, minDepth: 1, points: (d) => [start(5, 0), start(7, 2), los(7, d)] },
  // Step up through the middle.
  { id: 'stepUp', kind: 'qbRunIfBlitzed', name: 'Step up', defaultDepth: 3, minDepth: 1, points: (d) => [los(0, d)] },
]

const ALL_TEMPLATES = [...ROUTE_TREE, ...RUN_PATHS, ...BLITZ_RUNS]

export const getRoute = (id: string): RouteTemplate | undefined => ALL_TEMPLATES.find((r) => r.id === id)

/** True for a path that comes from a template, as opposed to a freehand one. */
export const isTreeRoute = (name: string | undefined): name is RouteId => !!name && !!getRoute(name)

/**
 * Which way is "outside" for a player: +1 is toward the right sideline, -1 toward the left.
 * A player on the ball has no natural outside, so right is used. `flipped` reverses it.
 */
export const outsideDir = (playerStart: Point, flipped = false): 1 | -1 =>
  ((playerStart.x < 0 ? -1 : 1) * (flipped ? -1 : 1)) as 1 | -1

export const clampDepth = (route: RouteTemplate, depth: Yd): Yd =>
  Math.min(MAX_ROUTE_DEPTH, Math.max(route.minDepth, Math.round(depth)))

/** Drops points that repeat the one before them, including a first point that sits on the start. */
export function dedupe(path: Point[]): Point[] {
  const out: Point[] = []
  let prev: Point = { x: 0, y: 0 }
  for (const p of path) {
    if (p.x !== prev.x || p.y !== prev.y) out.push(p)
    prev = p
  }
  return out
}

/** Pulls a path, given as offsets from `playerStart`, inside the field. */
export function clampPath(path: Point[], playerStart: Point, bounds: Bounds): Point[] {
  return dedupe(
    path.map((p) => {
      const abs = clampPoint({ x: playerStart.x + p.x, y: playerStart.y + p.y }, bounds)
      return { x: abs.x - playerStart.x + 0, y: abs.y - playerStart.y + 0 }
    }),
  )
}

export type BuildOptions = {
  depth?: Yd
  flipped?: boolean
  /** The field, so a route never runs out of bounds. */
  bounds?: Bounds
}

/**
 * Turns a template into waypoints for one player, as offsets from the player's start.
 * The same route from any spot on the same side is the same shape past the line of scrimmage.
 */
export function buildRoute(id: RouteId, playerStart: Point, options: BuildOptions = {}): Point[] {
  const route = getRoute(id)
  if (!route) return []
  const depth = clampDepth(route, options.depth ?? route.defaultDepth)
  const dir = outsideDir(playerStart, options.flipped)

  const path = route.points(depth).map((p) => ({
    x: p.x * dir + 0,
    y: p.from === 'los' ? p.y - playerStart.y : p.y,
  }))

  return options.bounds ? clampPath(path, playerStart, options.bounds) : dedupe(path)
}
