import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, feet } from '../model/defaults'
import { clampPoint, lineupBounds, lineupSpot, mirrorPoint, snap, snapPoint } from './snap'

describe('snap', () => {
  it('rounds to the nearest whole yard', () => {
    expect(snap(4.4)).toBe(4)
    expect(snap(4.5)).toBe(5)
    expect(snap(-4.6)).toBe(-5)
    expect(snapPoint({ x: 7.49, y: -1.51 })).toEqual({ x: 7, y: -2 })
  })

  it('never returns negative zero', () => {
    expect(Object.is(snap(-0.2), 0)).toBe(true)
  })

  it('supports another grid size', () => {
    expect(snap(4.3, 0.5)).toBe(4.5)
  })
})

describe('mirrorPoint', () => {
  it('flips left and right and leaves depth alone', () => {
    expect(mirrorPoint({ x: 12, y: -3 })).toEqual({ x: -12, y: -3 })
    expect(mirrorPoint({ x: -7, y: 5 })).toEqual({ x: 7, y: 5 })
  })

  it('leaves a player on the ball where they are, and twice is a no-op', () => {
    expect(Object.is(mirrorPoint({ x: 0, y: -1 }).x, 0)).toBe(true)
    expect(mirrorPoint(mirrorPoint({ x: 9, y: -2 }))).toEqual({ x: 9, y: -2 })
  })
})

describe('lineupBounds', () => {
  it('spans the sidelines and keeps everyone a yard behind the line of scrimmage', () => {
    expect(lineupBounds(12, DEFAULT_RULES)).toEqual({ xMin: -20, xMax: 20, yMin: -11, yMax: -1 })
  })

  it('does not let a player line up behind their own end zone', () => {
    // Drive start: 3⅓ yd of field plus an 8⅓ yd end zone behind the ball.
    const b = lineupBounds(50 - feet(10), DEFAULT_RULES)
    expect(b.yMin).toBe(-10)
  })
})

describe('lineupSpot', () => {
  it('snaps a drop to the grid', () => {
    expect(lineupSpot({ x: 6.6, y: -3.2 }, 12, DEFAULT_RULES)).toEqual({ x: 7, y: -3 })
  })

  it('pulls a drop past the line of scrimmage back behind it', () => {
    expect(lineupSpot({ x: 3, y: 4 }, 12, DEFAULT_RULES)).toEqual({ x: 3, y: -1 })
    expect(lineupSpot({ x: 3, y: -0.2 }, 12, DEFAULT_RULES)).toEqual({ x: 3, y: -1 })
  })

  it('pulls a drop out of bounds back to the sideline', () => {
    expect(lineupSpot({ x: 31, y: -2 }, 12, DEFAULT_RULES)).toEqual({ x: 20, y: -2 })
    expect(lineupSpot({ x: -99, y: -40 }, 12, DEFAULT_RULES)).toEqual({ x: -20, y: -11 })
  })

  it('clamps to the given bounds', () => {
    expect(clampPoint({ x: 5, y: 5 }, { xMin: 0, xMax: 2, yMin: 0, yMax: 3 })).toEqual({ x: 2, y: 3 })
  })
})
