import { describe, expect, it } from 'vitest'
import { arrowHead, distanceAlongPath, lastSegment, nearestPointOnPath, pathLength, pointAt, splitPath } from './path'

const L = [
  { x: 0, y: 0 },
  { x: 0, y: 5 },
  { x: 5, y: 5 },
]

describe('pathLength', () => {
  it('adds up the segments', () => {
    expect(pathLength(L)).toBe(10)
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5)
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0)
  })
})

describe('splitPath', () => {
  it('cuts in the middle of a segment', () => {
    const [head, tail] = splitPath(L, 2)
    expect(head).toEqual([{ x: 0, y: 0 }, { x: 0, y: 2 }])
    expect(tail).toEqual([{ x: 0, y: 2 }, { x: 0, y: 5 }, { x: 5, y: 5 }])
  })

  it('cuts past a corner and keeps the corner in the first part', () => {
    const [head, tail] = splitPath(L, 7)
    expect(head).toEqual([{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 2, y: 5 }])
    expect(tail).toEqual([{ x: 2, y: 5 }, { x: 5, y: 5 }])
  })

  it('keeps total length', () => {
    const [head, tail] = splitPath(L, 3.3)
    expect(pathLength(head) + pathLength(tail)).toBeCloseTo(10, 9)
  })

  it('handles cuts at or beyond either end', () => {
    expect(splitPath(L, 0)).toEqual([[L[0]], L])
    expect(splitPath(L, 99)).toEqual([L, [L[2]]])
  })
})

describe('lastSegment', () => {
  it('skips a repeated end point', () => {
    expect(lastSegment([...L, { x: 5, y: 5 }])).toEqual([{ x: 0, y: 5 }, { x: 5, y: 5 }])
    expect(lastSegment([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBeNull()
  })
})

describe('arrowHead', () => {
  it('puts the tip on the end point and the base behind it, pointing along the line', () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 6)!
    expect(tip).toEqual({ x: 10, y: 0 })
    expect(a).toEqual({ x: 6, y: 3 })
    expect(b).toEqual({ x: 6, y: -3 })
  })

  it('points along a diagonal with the requested length and width', () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: 3, y: 4 }, 5, 2)!
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    expect(Math.hypot(tip.x - mid.x, tip.y - mid.y)).toBeCloseTo(5, 9)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2, 9)
    // The base center sits back along the line, at the line's start here.
    expect(mid.x).toBeCloseTo(0, 9)
    expect(mid.y).toBeCloseTo(0, 9)
  })

  it('returns nothing for a zero-length segment', () => {
    expect(arrowHead({ x: 1, y: 1 }, { x: 1, y: 1 }, 4)).toBeNull()
  })
})

describe('nearestPointOnPath', () => {
  it('finds the closest spot along a segment', () => {
    expect(nearestPointOnPath(L, { x: -3, y: 2 })).toEqual({ x: 0, y: 2 })
    expect(nearestPointOnPath(L, { x: 3, y: 9 })).toEqual({ x: 3, y: 5 })
  })

  it('stops at the ends of the path', () => {
    expect(nearestPointOnPath(L, { x: 0, y: -4 })).toEqual({ x: 0, y: 0 })
    expect(nearestPointOnPath(L, { x: 9, y: 5 })).toEqual({ x: 5, y: 5 })
  })

  it('handles a single point and an empty path', () => {
    expect(nearestPointOnPath([{ x: 1, y: 1 }], { x: 9, y: 9 })).toEqual({ x: 1, y: 1 })
    expect(nearestPointOnPath([], { x: 9, y: 9 })).toBeNull()
  })
})

describe('pointAt', () => {
  it('walks a distance along the path, around corners', () => {
    expect(pointAt(L, 2)).toEqual({ x: 0, y: 2 })
    expect(pointAt(L, 5)).toEqual({ x: 0, y: 5 })
    expect(pointAt(L, 8)).toEqual({ x: 3, y: 5 })
  })

  it('stops at the start and the end', () => {
    expect(pointAt(L, -3)).toEqual({ x: 0, y: 0 })
    expect(pointAt(L, 99)).toEqual({ x: 5, y: 5 })
    expect(pointAt([{ x: 4, y: 4 }], 2)).toEqual({ x: 4, y: 4 })
  })
})

describe('distanceAlongPath', () => {
  it('measures how far along the path its closest point is', () => {
    expect(distanceAlongPath(L, { x: -2, y: 3 })).toBe(3)
    expect(distanceAlongPath(L, { x: 4, y: 9 })).toBe(9)
    expect(distanceAlongPath(L, { x: 0, y: -5 })).toBe(0)
  })

  it('is the inverse of pointAt for a point on the path', () => {
    expect(distanceAlongPath(L, pointAt(L, 6.5))).toBeCloseTo(6.5, 9)
  })
})
