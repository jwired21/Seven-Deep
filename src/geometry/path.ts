/**
 * Polyline helpers. Unit-agnostic: they work the same on yards, pixels, or PDF points,
 * so the screen and the PDF draw arrowheads and dashes from one implementation.
 */

export type Vec = { x: number; y: number }

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y)

export const pathLength = (points: Vec[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0)

/**
 * Cuts a polyline at a distance from its start.
 * The first part ends at the cut and the second part starts there.
 */
export function splitPath(points: Vec[], at: number): [Vec[], Vec[]] {
  if (points.length < 2 || at <= 0) return [points.slice(0, 1), points]
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const step = dist(a, b)
    if (step > 0 && walked + step >= at) {
      const f = (at - walked) / step
      const cut = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
      return [[...points.slice(0, i), cut], [cut, ...points.slice(i)]]
    }
    walked += step
  }
  return [points, points.slice(-1)]
}

/** The last segment that has length, so the arrow knows which way to point. */
export function lastSegment(points: Vec[]): [Vec, Vec] | null {
  for (let i = points.length - 1; i > 0; i--) {
    if (dist(points[i - 1], points[i]) > 0) return [points[i - 1], points[i]]
  }
  return null
}

/**
 * A triangle with its tip on `to`, pointing away from `from`.
 * Returned as [tip, left corner, right corner].
 */
export function arrowHead(from: Vec, to: Vec, length: number, width: number = length): [Vec, Vec, Vec] | null {
  const d = dist(from, to)
  if (d === 0) return null
  const ux = (to.x - from.x) / d
  const uy = (to.y - from.y) / d
  const base = { x: to.x - ux * length, y: to.y - uy * length }
  const half = width / 2
  return [
    to,
    { x: base.x - uy * half, y: base.y + ux * half },
    { x: base.x + uy * half, y: base.y - ux * half },
  ]
}

/** The point on a polyline closest to `p`. */
export function nearestPointOnPath(points: Vec[], p: Vec): Vec | null {
  if (points.length === 0) return null
  let best = points[0]
  let bestDist = dist(best, p)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const f = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSq))
    const candidate = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    const d = dist(candidate, p)
    if (d < bestDist) {
      best = candidate
      bestDist = d
    }
  }
  return best
}

/** The point a given distance along a polyline from its start. Stops at either end. */
export function pointAt(points: Vec[], distance: number): Vec {
  if (points.length === 0) return { x: 0, y: 0 }
  if (distance <= 0) return points[0]
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const step = dist(a, b)
    if (step > 0 && walked + step >= distance) {
      const f = (distance - walked) / step
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    }
    walked += step
  }
  return points[points.length - 1]
}

/** How far along a polyline its closest point to `p` is, measured from the start. */
export function distanceAlongPath(points: Vec[], p: Vec): number {
  let best = 0
  let bestDist = points.length ? dist(points[0], p) : 0
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const step = dist(a, b)
    const f = step === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (step * step)))
    const d = dist({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, p)
    if (d < bestDist) {
      bestDist = d
      best = walked + step * f
    }
    walked += step
  }
  return best
}
