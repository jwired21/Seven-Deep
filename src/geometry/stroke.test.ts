import { describe, expect, it } from 'vitest'
import { pathLength } from './path'
import { simplifyStroke, straightenEnd, tidyStroke } from './stroke'

/** A circle of radius r yards drawn with n points, starting and ending at (r, 0). */
const loop = (r: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })

describe('simplifyStroke', () => {
  it('turns a wobbly straight line into its two ends', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.2, y: (i % 2) * 0.04 }))
    expect(simplifyStroke(line, 0.1)).toEqual([line[0], line[49]])
  })

  it('keeps a corner', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 0, y: 2.5 },
      { x: 0, y: 5 },
      { x: 2.5, y: 5 },
      { x: 5, y: 5 },
    ]
    expect(simplifyStroke(corner, 0.1)).toEqual([corner[0], corner[2], corner[4]])
  })

  it('keeps a loop a loop: never more than the tolerance from the line as drawn', () => {
    const drawn = loop(3, 400)
    const out = simplifyStroke(drawn, 0.1)
    expect(out.length).toBeLessThan(60)
    expect(out.length).toBeGreaterThan(12)
    // Still goes all the way round: about 2 x pi x 3 = 18.85 yd.
    expect(pathLength(out)).toBeGreaterThan(18.5)
    expect(pathLength(out)).toBeLessThanOrEqual(pathLength(drawn) + 1e-9)
    // Every kept point is one that was drawn, 3 yd from the middle.
    for (const p of out) expect(Math.hypot(p.x, p.y)).toBeCloseTo(3)
  })

  it('always keeps both ends, even of a closed loop', () => {
    const drawn = loop(2, 100)
    const out = simplifyStroke(drawn, 0.1)
    expect(out[0]).toBe(drawn[0])
    expect(out.at(-1)).toBe(drawn.at(-1))
  })

  it('leaves one or two points alone', () => {
    expect(simplifyStroke([{ x: 1, y: 1 }], 0.1)).toEqual([{ x: 1, y: 1 }])
    expect(simplifyStroke([], 0.1)).toEqual([])
  })
})

describe('straightenEnd', () => {
  it('drops the points just before the end, so the last piece is long enough for an arrowhead', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 0.2, y: 5.6 },
      { x: 0.1, y: 5.9 },
      { x: 0, y: 6 },
    ]
    expect(straightenEnd(path, 0.75)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 0, y: 6 },
    ])
  })

  it('never drops the start, however short the line', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]
    expect(straightenEnd(short, 0.75)).toEqual([short[0], short[2]])
  })
})

describe('tidyStroke', () => {
  const options = { tolerance: 0.1, maxPoints: 150, endLength: 0.75 }

  it('loosens the tolerance until a long scribble fits the point limit', () => {
    // Ten tight loops: far more detail than 20 points can hold at 0.1 yd.
    const scribble = Array.from({ length: 2000 }, (_, i) => {
      const a = (i / 200) * Math.PI * 2
      return { x: Math.cos(a) + i * 0.01, y: Math.sin(a) }
    })
    const out = tidyStroke(scribble, { ...options, maxPoints: 20 })
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out[0]).toBe(scribble[0])
    expect(out.at(-1)).toBe(scribble.at(-1))
  })

  it('ends a loop with a straight piece', () => {
    const out = tidyStroke([...loop(3, 400), { x: 3, y: 2 }], options)
    const [a, b] = out.slice(-2)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(0.75)
  })
})
