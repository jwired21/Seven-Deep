import { describe, expect, it } from 'vitest'
import { FORMATIONS } from '../formations/formations'
import { fieldBounds } from '../geometry/snap'
import { DEFAULT_RULES } from '../model/defaults'
import { createPlayers } from '../model/players'
import { buildRoute, clampDepth, getRoute, outsideDir, ROUTE_TREE } from './routeTree'

const bounds = fieldBounds(12, DEFAULT_RULES)
const end = (path: { x: number; y: number }[]) => path[path.length - 1]

describe('route tree', () => {
  it('has the eight routes from the brief', () => {
    expect(ROUTE_TREE.map((r) => r.id)).toEqual(['slant', 'out', 'in', 'hitch', 'corner', 'post', 'go', 'wheel'])
  })

  it('lets every player in every formation run every route, center included', () => {
    for (const formation of FORMATIONS) {
      for (const player of createPlayers(formation.spots)) {
        for (const route of ROUTE_TREE) {
          const path = buildRoute(route.id, player.start, { bounds })
          const where = `${route.id} for ${player.label} in ${formation.name}`
          expect(path.length, where).toBeGreaterThan(0)
          // Ends somewhere other than where it started, past the line of scrimmage, in bounds.
          const last = { x: player.start.x + end(path).x, y: player.start.y + end(path).y }
          expect(last.y, where).toBeGreaterThan(0)
          expect(Math.abs(last.x), where).toBeLessThanOrEqual(20)
          expect(last.y, where).toBeLessThanOrEqual(bounds.yMax)
        }
      }
    }
  })
})

describe('buildRoute', () => {
  const leftWide = { x: -16, y: -1 }
  const leftSlot = { x: -8, y: -1 }
  const rightWide = { x: 16, y: -1 }

  it('is the same shape from any spot on the same side', () => {
    for (const route of ROUTE_TREE) {
      expect(buildRoute(route.id, leftSlot)).toEqual(buildRoute(route.id, { x: -11, y: -1 }))
    }
  })

  it('is the mirror image on the other side of the ball', () => {
    for (const route of ROUTE_TREE) {
      const left = buildRoute(route.id, leftSlot)
      const right = buildRoute(route.id, { x: 8, y: -1 })
      expect(right).toEqual(left.map((p) => ({ x: -p.x + 0, y: p.y })))
    }
  })

  it('breaks at the same depth past the line of scrimmage however deep the player lines up', () => {
    const onLine = buildRoute('out', { x: -8, y: -1 })
    const offLine = buildRoute('out', { x: -8, y: -3 })
    const back = buildRoute('out', { x: 3, y: -5 })
    // Offsets are from the start, so add the start depth back to get yards past the line.
    expect(onLine[0].y - 1).toBe(5)
    expect(offLine[0].y - 3).toBe(5)
    expect(back[0].y - 5).toBe(5)
  })

  it('sends an out to the sideline and an in to the middle', () => {
    expect(end(buildRoute('out', leftSlot)).x).toBeLessThan(0)
    expect(end(buildRoute('in', leftSlot)).x).toBeGreaterThan(0)
    expect(end(buildRoute('out', { x: 8, y: -1 })).x).toBeGreaterThan(0)
    expect(end(buildRoute('in', { x: 8, y: -1 })).x).toBeLessThan(0)
  })

  it('draws each route the way the name says', () => {
    const from = { x: -8, y: -1 }
    // Slant: 2 yd stem, then up and in.
    expect(buildRoute('slant', from)).toEqual([{ x: 0, y: 3 }, { x: 5, y: 7 }])
    // Hitch: up to 5, then a step back toward the QB.
    expect(buildRoute('hitch', from)).toEqual([{ x: 0, y: 6 }, { x: 1, y: 5 }])
    // Corner: up to 7, then up and out.
    expect(buildRoute('corner', from)).toEqual([{ x: 0, y: 8 }, { x: -5, y: 13 }])
    // Post: up to 7, then up and in.
    expect(buildRoute('post', from)).toEqual([{ x: 0, y: 8 }, { x: 4, y: 14 }])
    // Go: straight up 12.
    expect(buildRoute('go', from)).toEqual([{ x: 0, y: 13 }])
    // Wheel: out to the flat, then up the sideline.
    expect(buildRoute('wheel', from)).toEqual([{ x: -3, y: 0 }, { x: -5, y: 2 }, { x: -5, y: 13 }])
  })

  it('follows the depth setting', () => {
    expect(buildRoute('out', leftSlot, { depth: 8 })).toEqual([{ x: 0, y: 9 }, { x: -5, y: 9 }])
    expect(buildRoute('go', leftSlot, { depth: 20 })).toEqual([{ x: 0, y: 21 }])
  })

  it('keeps depth inside the route’s limits', () => {
    expect(clampDepth(getRoute('wheel')!, 0)).toBe(3)
    expect(clampDepth(getRoute('go')!, 99)).toBe(30)
    expect(clampDepth(getRoute('out')!, 6.4)).toBe(6)
  })

  it('sends the center right by default and left when flipped', () => {
    const center = { x: 0, y: -1 }
    expect(outsideDir(center)).toBe(1)
    expect(end(buildRoute('out', center)).x).toBe(5)
    expect(end(buildRoute('out', center, { flipped: true })).x).toBe(-5)
  })

  it('lets a receiver break against their natural side when flipped', () => {
    expect(end(buildRoute('out', leftSlot, { flipped: true })).x).toBeGreaterThan(0)
  })

  it('stops at the sideline instead of running out of bounds', () => {
    // Wide right at x = 16 on a 40 yd field: only 4 yd of room for a 5 yd out.
    expect(buildRoute('out', rightWide, { bounds })).toEqual([{ x: 0, y: 6 }, { x: 4, y: 6 }])
    expect(buildRoute('out', leftWide, { bounds })).toEqual([{ x: 0, y: 6 }, { x: -4, y: 6 }])
  })

  it('stops at the back of the end zone near the goal line', () => {
    // Ball on the 2: the back of the end zone is 2 + 8⅓ yd past the line.
    const tight = fieldBounds(2, DEFAULT_RULES)
    const path = buildRoute('go', leftSlot, { bounds: tight })
    expect(-1 + end(path).y).toBeCloseTo(tight.yMax, 9)
  })

  it('never returns negative zero or a repeated point', () => {
    for (const route of ROUTE_TREE) {
      const path = buildRoute(route.id, leftSlot, { bounds })
      for (const p of path) {
        expect(Object.is(p.x, -0) || Object.is(p.y, -0)).toBe(false)
      }
      const keys = path.map((p) => `${p.x},${p.y}`)
      expect(keys.every((k, i) => k !== keys[i - 1])).toBe(true)
    }
  })
})
