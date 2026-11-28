import { beforeEach, describe, expect, it } from 'vitest'
import { FORMATIONS } from '../formations/formations'
import { absolutePath, getAssignment } from '../routes/assignments'
import { ROUTE_TREE } from '../routes/routeTree'
import { redo, resetEditor, undo, useEditor } from './editorStore'

const state = () => useEditor.getState()
const player = (label: string) => state().play.players.find((p) => p.label === label)!
const idOf = (label: string) => player(label).id
const route = (label: string) => getAssignment(state().play, idOf(label))
/** The route as field positions, including the player's start. */
const drawn = (label: string) => absolutePath(state().play, player(label), route(label)!)
const history = () => useEditor.temporal.getState()

beforeEach(resetEditor)

describe('routes from the tree', () => {
  it('lets every player, center included, run every route in the tree, from every formation', () => {
    for (const formation of FORMATIONS) {
      state().loadFormation(formation.id)
      for (const { id, label } of state().play.players) {
        for (const tree of ROUTE_TREE) {
          state().setRoute(id, tree.id)
          const a = route(label)!
          const where = `${tree.id} for ${label} in ${formation.name}`
          expect(a.kind, where).toBe('route')
          expect(a.routeName, where).toBe(tree.id)
          expect(a.routeDepth, where).toBe(tree.defaultDepth)
          expect(a.path.length, where).toBeGreaterThan(0)
        }
      }
    }
    // One route per player, never duplicates.
    expect(state().play.assignments).toHaveLength(7)
  })

  it('draws a 5-yard out for the slot receiver: up to 5 past the line, then to the sideline', () => {
    state().setRoute(idOf('Y'), 'out')
    expect(drawn('Y')).toEqual([
      { x: -8, y: -1 },
      { x: -8, y: 5 },
      { x: -13, y: 5 },
    ])
  })

  it('gives the center a route like anyone else', () => {
    state().setRoute(idOf('C'), 'hitch')
    expect(drawn('C')).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: 5 },
      { x: -1, y: 4 },
    ])
  })

  it('replaces a route when another is picked, and undoes back through them', () => {
    state().setRoute(idOf('Z'), 'post')
    state().setRoute(idOf('Z'), 'go')
    expect(route('Z')!.routeName).toBe('go')
    undo()
    expect(route('Z')!.routeName).toBe('post')
    undo()
    expect(route('Z')).toBeUndefined()
    redo()
    expect(route('Z')!.routeName).toBe('post')
  })

  it('changes the depth of the break', () => {
    state().setRoute(idOf('Y'), 'out')
    state().setRouteDepth(idOf('Y'), 8)
    expect(route('Y')!.routeDepth).toBe(8)
    expect(drawn('Y')[1]).toEqual({ x: -8, y: 8 })
    expect(drawn('Y')[2]).toEqual({ x: -13, y: 8 })
  })

  it('keeps depth within the route’s limits', () => {
    state().setRoute(idOf('Y'), 'wheel')
    state().setRouteDepth(idOf('Y'), 0)
    expect(route('Y')!.routeDepth).toBe(3)
  })

  it('keeps the chosen depth when the same route is picked again, and resets it for a different one', () => {
    state().setRoute(idOf('Y'), 'out')
    state().setRouteDepth(idOf('Y'), 9)
    state().setRoute(idOf('Y'), 'out')
    expect(route('Y')!.routeDepth).toBe(9)
    state().setRoute(idOf('Y'), 'in')
    expect(route('Y')!.routeDepth).toBe(5)
  })

  it('flips which way a route breaks, so the center can go left', () => {
    state().setRoute(idOf('C'), 'out')
    expect(drawn('C').at(-1)).toEqual({ x: 5, y: 5 })
    state().flipRoute(idOf('C'))
    expect(drawn('C').at(-1)).toEqual({ x: -5, y: 5 })
    state().flipRoute(idOf('C'))
    expect(drawn('C').at(-1)).toEqual({ x: 5, y: 5 })
    expect(route('C')!.routeFlipped).toBeUndefined()
  })

  it('clears a route', () => {
    state().setRoute(idOf('W'), 'slant')
    state().clearRoute(idOf('W'))
    expect(route('W')).toBeUndefined()
    undo()
    expect(route('W')!.routeName).toBe('slant')
  })
})

describe('delayed release', () => {
  it('sets, changes, and removes the delay', () => {
    state().setRoute(idOf('C'), 'hitch')
    state().setDelay(idOf('C'), 1)
    expect(route('C')!.delayCounts).toBe(1)
    state().setDelay(idOf('C'), 9)
    expect(route('C')!.delayCounts).toBe(3)
    state().setDelay(idOf('C'), 0)
    expect('delayCounts' in route('C')!).toBe(false)
  })

  it('survives a change of route', () => {
    state().setRoute(idOf('C'), 'hitch')
    state().setDelay(idOf('C'), 2)
    state().setRoute(idOf('C'), 'go')
    expect(route('C')!.delayCounts).toBe(2)
  })

  it('does nothing for a player with no route', () => {
    state().setDelay(idOf('C'), 1)
    expect(route('C')).toBeUndefined()
    expect(history().pastStates).toHaveLength(0)
  })
})

describe('routes follow their players', () => {
  it('moves the route with a dragged player and keeps the break at the same depth', () => {
    state().setRoute(idOf('Y'), 'out')
    state().movePlayer(idOf('Y'), { x: -10, y: -3 })
    expect(drawn('Y')).toEqual([
      { x: -10, y: -3 },
      { x: -10, y: 5 },
      { x: -15, y: 5 },
    ])
  })

  it('turns an out around when the player is dragged to the other side of the ball', () => {
    state().setRoute(idOf('Y'), 'out')
    state().movePlayer(idOf('Y'), { x: 6, y: -1 })
    expect(drawn('Y').at(-1)).toEqual({ x: 11, y: 5 })
  })

  it('refits routes when a formation is loaded', () => {
    state().setRoute(idOf('W'), 'out')
    // Spread W is at x = 16, so the out is cut short at the sideline.
    expect(drawn('W').at(-1)).toEqual({ x: 20, y: 5 })
    state().loadFormation('tight')
    expect(drawn('W')).toEqual([
      { x: 4, y: -1 },
      { x: 4, y: 5 },
      { x: 9, y: 5 },
    ])
  })

  it('flips routes with a flipped formation', () => {
    state().loadFormation('trips')
    state().setRoute(idOf('W'), 'out')
    state().flipFormation()
    expect(drawn('W')).toEqual([
      { x: -17, y: -1 },
      { x: -17, y: 5 },
      { x: -20, y: 5 },
    ])
  })

  it('stops routes at the back of the end zone when the ball moves close to the goal line', () => {
    state().setRoute(idOf('X'), 'go')
    state().setBallOn(2)
    const backOfEndZone = 2 + state().rules.endZoneDepth
    expect(drawn('X').at(-1)!.y).toBeCloseTo(backOfEndZone, 9)
    // Moving back out restores the full route, because the depth is remembered.
    state().setBallOn(20)
    expect(drawn('X').at(-1)!.y).toBe(12)
  })
})

describe('freehand routes', () => {
  it('adds waypoints where the field is clicked, snapped to whole yards', () => {
    state().startFreehand(idOf('Z'))
    expect(state().drawingFor).toBe(idOf('Z'))
    state().addWaypoint({ x: 8.2, y: 3.6 })
    state().addWaypoint({ x: 12.7, y: 6.4 })
    expect(route('Z')!.routeName).toBe('custom')
    expect(drawn('Z')).toEqual([
      { x: 8, y: -1 },
      { x: 8, y: 4 },
      { x: 13, y: 6 },
    ])
  })

  it('stores waypoints as offsets from the player', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    expect(route('Z')!.path).toEqual([{ x: 0, y: 5 }])
  })

  it('ignores a click on the same spot twice and a click on the player’s own spot', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: -1 })
    state().addWaypoint({ x: 8, y: 4 })
    state().addWaypoint({ x: 8.3, y: 4.2 })
    expect(route('Z')!.path).toHaveLength(1)
  })

  it('keeps waypoints inside the field', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 40, y: 99 })
    const last = drawn('Z').at(-1)!
    expect(last.x).toBe(20)
    expect(last.y).toBeCloseTo(12 + state().rules.endZoneDepth, 9)
  })

  it('undoes one waypoint at a time', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    state().addWaypoint({ x: 13, y: 6 })
    undo()
    expect(route('Z')!.path).toHaveLength(1)
  })

  it('stops drawing, and drops a route that never got a waypoint', () => {
    state().startFreehand(idOf('Z'))
    state().stopFreehand()
    expect(state().drawingFor).toBeNull()
    expect(route('Z')).toBeUndefined()

    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    state().stopFreehand()
    expect(route('Z')!.path).toHaveLength(1)
  })

  it('does not add waypoints when not drawing', () => {
    state().addWaypoint({ x: 8, y: 4 })
    expect(state().play.assignments).toHaveLength(0)
  })

  it('stops drawing when another player is selected or a tree route is picked', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    state().select(idOf('X'))
    expect(state().drawingFor).toBeNull()

    state().startFreehand(idOf('Z'))
    state().setRoute(idOf('Z'), 'go')
    expect(state().drawingFor).toBeNull()
    expect(route('Z')!.routeName).toBe('go')
  })

  it('travels with its player and keeps its shape', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    state().addWaypoint({ x: 13, y: 6 })
    state().stopFreehand()
    state().movePlayer(idOf('Z'), { x: 5, y: -2 })
    expect(drawn('Z')).toEqual([
      { x: 5, y: -2 },
      { x: 5, y: 3 },
      { x: 10, y: 5 },
    ])
  })

  it('flips its shape when its player crosses the ball in a flipped formation', () => {
    state().loadFormation('trips')
    state().startFreehand(idOf('W'))
    state().addWaypoint({ x: 17, y: 4 })
    state().addWaypoint({ x: 12, y: 8 })
    state().stopFreehand()
    state().flipFormation()
    expect(drawn('W')).toEqual([
      { x: -17, y: -1 },
      { x: -17, y: 4 },
      { x: -12, y: 8 },
    ])
  })
})

describe('hand-drawn lines', () => {
  /** A loop of radius 2 yd around (12, 5), as a pointer would report it: many close points. */
  const loop = Array.from({ length: 201 }, (_, i) => {
    const a = (i / 200) * Math.PI * 2
    return { x: 12 + 2 * Math.cos(a), y: 5 + 2 * Math.sin(a) }
  })

  it('keeps the curve: a loop stays within a tenth of a yard of the line as drawn, off the grid', () => {
    state().startFreehand(idOf('Z'))
    state().addStroke(loop)
    const points = drawn('Z').slice(1)
    expect(points.length).toBeGreaterThan(12)
    expect(points.length).toBeLessThanOrEqual(150)
    for (const p of points) expect(Math.abs(Math.hypot(p.x - 12, p.y - 5) - 2)).toBeLessThan(0.02)
    expect(points.some((p) => !Number.isInteger(p.x))).toBe(true)
    expect(route('Z')!.routeName).toBe('custom')
  })

  it('is one undo step, however many points it has', () => {
    state().startFreehand(idOf('Z'))
    const before = history().pastStates.length
    state().addStroke(loop)
    expect(history().pastStates.length).toBe(before + 1)
    undo()
    expect(route('Z')!.path).toEqual([])
    redo()
    expect(route('Z')!.path.length).toBeGreaterThan(12)
  })

  it('joins on to waypoints already clicked, and more can follow', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    state().addStroke([
      { x: 8, y: 4 },
      { x: 9, y: 6.5 },
      { x: 11.5, y: 7.5 },
    ])
    state().addWaypoint({ x: 15, y: 8 })
    const points = drawn('Z')
    expect(points[1]).toEqual({ x: 8, y: 4 })
    expect(points.at(-2)).toEqual({ x: 11.5, y: 7.5 })
    expect(points.at(-1)).toEqual({ x: 15, y: 8 })
  })

  it('stays inside the field', () => {
    state().startFreehand(idOf('Z'))
    state().addStroke([
      { x: 8, y: 2 },
      { x: 30, y: 4 },
      { x: 60, y: 9 },
    ])
    const half = state().rules.fieldWidth / 2
    for (const p of drawn('Z')) expect(p.x).toBeLessThanOrEqual(half)
  })

  it('keeps hand-drawn motion behind the line, and sets the player on the grid', () => {
    state().startFreehand(idOf('Z'), 'motion')
    state().addStroke([
      { x: 8, y: -1 },
      { x: 6, y: -2.6 },
      { x: 3.4, y: 2 },
    ])
    const motion = getAssignment(state().play, idOf('Z'), 'motion')!
    const path = absolutePath(state().play, player('Z'), motion)
    for (const p of path) expect(p.y).toBeLessThanOrEqual(-1)
    expect(path.at(-1)).toEqual({ x: 3, y: -1 })
  })

  it('travels with the player like any other path', () => {
    state().startFreehand(idOf('Z'))
    state().addStroke(loop)
    state().stopFreehand()
    const before = route('Z')!.path
    state().movePlayer(idOf('Z'), { x: 5, y: -3 })
    expect(route('Z')!.path).toEqual(before)
  })

  it('does nothing unless a path is being drawn', () => {
    const before = state().play
    state().addStroke(loop)
    expect(state().play).toBe(before)
  })
})

describe('drawing style', () => {
  it('starts on curved, and the choice is a tool setting: not an undo step, and kept between paths', () => {
    expect(state().drawingStyle).toBe('hand')
    state().startFreehand(idOf('Z'))
    const steps = history().pastStates.length
    state().setDrawingStyle('points')
    expect(history().pastStates.length).toBe(steps)
    state().stopFreehand()
    state().startFreehand(idOf('X'))
    expect(state().drawingStyle).toBe('points')
  })
})
