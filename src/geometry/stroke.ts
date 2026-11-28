import type { Vec } from './path'

/**
 * Tidying a line drawn by hand: a mouse or a finger dragged across the field.
 * Unit-agnostic like path.ts, but the editor only ever calls it in yards.
 */

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y)

/** How far `p` is from the segment a-b. */
function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t })
}

/**
 * Drops every point the line can do without: the result never strays more than
 * `tolerance` from the line as drawn. Curves and loops keep their shape, a straight
 * stretch becomes two points. (Ramer-Douglas-Peucker.) The two ends are always kept.
 */
export function simplifyStroke<T extends Vec>(points: T[], tolerance: number): T[] {
  if (points.length <= 2) return [...points]
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last])
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = true
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Makes the last stretch one straight piece at least `length` long, where the line is
 * long enough, by dropping the points just before the end. An arrowhead then has a
 * steady direction to point in, however the hand wobbled on release.
 */
export function straightenEnd<T extends Vec>(points: T[], length: number): T[] {
  if (points.length <= 2) return [...points]
  const end = points[points.length - 1]
  let cut = points.length - 1
  while (cut > 1 && dist(points[cut - 1], end) < length) cut--
  return [...points.slice(0, cut), end]
}

export type TidyOptions = {
  /** How far the tidied line may stray from the drawn one. */
  tolerance: number
  /** The most points to keep. The tolerance is loosened until the line fits. */
  maxPoints: number
  /** The shortest the last straight piece should be, for the arrowhead. */
  endLength: number
}

/** A hand-drawn line made ready to store: few enough points, and a clean end. */
export function tidyStroke<T extends Vec>(points: T[], { tolerance, maxPoints, endLength }: TidyOptions): T[] {
  let out = simplifyStroke(points, tolerance)
  for (let t = tolerance * 1.5; out.length > maxPoints; t *= 1.5) out = simplifyStroke(points, t)
  return straightenEnd(out, endLength)
}
