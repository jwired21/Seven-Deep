import { beforeEach, describe, expect, it } from 'vitest'
import { absolutePath, getAssignment, handoffPoint, snapSpot } from '../routes/assignments'
import { BLITZ_RUNS, RUN_PATHS } from '../routes/routeTree'
import { resetEditor, undo, useEditor } from './editorStore'

const state = () => useEditor.getState()
const player = (label: string) => state().play.players.find((p) => p.label === label)!
const idOf = (label: string) => player(label).id
const main = (label: string) => getAssignment(state().play, idOf(label))
const motion = (label: string) => getAssignment(state().play, idOf(label), 'motion')
const blitz = (label: string) => getAssignment(state().play, idOf(label), 'blitz')
const drawn = (label: string, a = main(label)!) => absolutePath(state().play, player(label), a)
const history = () => useEditor.temporal.getState()

beforeEach(resetEditor)

describe('run paths', () => {
  it('has dive, off tackle, and sweep', () => {
    expect(RUN_PATHS.map((r) => r.id)).toEqual(['dive', 'offTackle', 'sweep'])
  })

  it('gives any player a run path, stored as a run and not a route', () => {
    for (const { id, label } of state().play.players) {
      for (const run of RUN_PATHS) {
        state().setRoute(id, run.id)
        expect(main(label)!.kind, `${run.id} for ${label}`).toBe('run')
        expect(main(label)!.path.length, `${run.id} for ${label}`).toBeGreaterThan(0)
      }
    }
  })

  it('draws a sweep for the back: flat to the outside, then around the corner and upfield', () => {
    state().setRoute(idOf('RB'), 'sweep')
    expect(drawn('RB')).toEqual([
      { x: 3, y: -5 },
      { x: 9, y: -5 },
      { x: 12, y: -3 },
      { x: 13, y: 5 },
    ])
  })

  it('flips a sweep to the other side', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().flipRoute(idOf('RB'))
    expect(drawn('RB').at(-1)).toEqual({ x: -7, y: 5 })
  })

  it('replaces a route with a run and drops the read number, which only routes have', () => {
    state().setRoute(idOf('RB'), 'wheel')
    state().setReadOrder(idOf('RB'), 1)
    state().setRoute(idOf('RB'), 'dive')
    expect(main('RB')!.kind).toBe('run')
    expect(main('RB')!.readOrder).toBeUndefined()
    expect(state().play.assignments.filter((a) => a.playerId === idOf('RB'))).toHaveLength(1)
  })

  it('draws a freehand run', () => {
    state().startFreehand(idOf('RB'), 'run')
    state().addWaypoint({ x: 6, y: -3 })
    state().addWaypoint({ x: 8, y: 4 })
    state().stopFreehand()
    expect(main('RB')!.kind).toBe('run')
    expect(drawn('RB')).toEqual([
      { x: 3, y: -5 },
      { x: 6, y: -3 },
      { x: 8, y: 4 },
    ])
  })
})

describe('handoffs', () => {
  it('hands the ball to a back and gives them a dive when they have no run yet', () => {
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(main('QB')).toMatchObject({ kind: 'handoff', handoffTo: idOf('RB'), path: [] })
    expect(main('RB')).toMatchObject({ kind: 'run', routeName: 'dive' })
    // Both changes are one undo step.
    expect(history().pastStates).toHaveLength(1)
    undo()
    expect(state().play.assignments).toHaveLength(0)
  })

  it('keeps the run the carrier already has', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(main('RB')!.routeName).toBe('sweep')
  })

  it('replaces the carrier’s pass route with a run', () => {
    state().setRoute(idOf('RB'), 'wheel')
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(main('RB')!.kind).toBe('run')
  })

  it('removes a handoff', () => {
    state().setHandoff(idOf('QB'), idOf('RB'))
    state().setHandoff(idOf('QB'), null)
    expect(main('QB')).toBeUndefined()
    // The back keeps the run.
    expect(main('RB')!.kind).toBe('run')
  })

  it('cannot hand off to yourself, and not at all when the league forbids handoffs', () => {
    state().setHandoff(idOf('QB'), idOf('QB'))
    expect(main('QB')).toBeUndefined()

    useEditor.setState({ rules: { ...state().rules, handoffsAllowed: false } })
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(main('QB')).toBeUndefined()
  })

  it('lets a receiver hand off too, for a reverse', () => {
    state().setRoute(idOf('X'), 'sweep')
    state().setHandoff(idOf('RB'), idOf('X'))
    expect(main('RB')!.handoffTo).toBe(idOf('X'))
  })
})

describe('the two plays that prove the phase', () => {
  it('draws a sweep: QB hands to the back, who runs wide and turns the corner', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))

    const run = drawn('RB')
    // Starts flat, ends well outside where it began and past the line of scrimmage.
    expect(run[1].y).toBe(run[0].y)
    expect(run.at(-1)!.x).toBeGreaterThan(run[0].x + 8)
    expect(run.at(-1)!.y).toBeGreaterThan(0)

    // The handoff happens on the back's path, right beside the QB.
    expect(handoffPoint(state().play, player('QB'), main('QB')!)).toEqual({ x: 3, y: -5 })
  })

  it('draws a draw: a delayed handoff to the back straight up the middle', () => {
    state().movePlayer(idOf('RB'), { x: 1, y: -6 })
    state().setRoute(idOf('RB'), 'dive')
    state().setDelay(idOf('RB'), 2)
    state().setHandoff(idOf('QB'), idOf('RB'))

    expect(main('RB')).toMatchObject({ kind: 'run', routeName: 'dive', delayCounts: 2 })
    // Straight ahead, 4 yards past the line of scrimmage.
    expect(drawn('RB')).toEqual([
      { x: 1, y: -6 },
      { x: 1, y: 4 },
    ])
    expect(main('QB')!.kind).toBe('handoff')
    // The exchange is where the back passes the QB.
    expect(handoffPoint(state().play, player('QB'), main('QB')!)).toEqual({ x: 1, y: -5 })
  })
})

describe('motion', () => {
  it('is drawn by hand and kept alongside the player’s route', () => {
    state().setRoute(idOf('Y'), 'out')
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -4, y: -2 })
    state().stopFreehand()
    expect(motion('Y')!.kind).toBe('motion')
    expect(main('Y')!.routeName).toBe('out')
  })

  it('stays behind the line of scrimmage and on the grid', () => {
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -3.6, y: 6 })
    expect(drawn('Y', motion('Y')!)).toEqual([
      { x: -8, y: -1 },
      { x: -4, y: -1 },
    ])
  })

  it('moves where the player is at the snap, and their route starts there', () => {
    state().setRoute(idOf('Y'), 'out')
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -3, y: -2 })
    state().stopFreehand()

    expect(snapSpot(state().play, player('Y'))).toEqual({ x: -3, y: -2 })
    // Still a 5-yard out, now run from the new spot.
    expect(drawn('Y')).toEqual([
      { x: -3, y: -2 },
      { x: -3, y: 5 },
      { x: -8, y: 5 },
    ])
    // The player's lineup spot has not changed.
    expect(player('Y').start).toEqual({ x: -8, y: -1 })
  })

  it('turns an out around when the motion crosses the ball', () => {
    state().setRoute(idOf('Y'), 'out')
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: 5, y: -2 })
    expect(drawn('Y').at(-1)).toEqual({ x: 10, y: 5 })
  })

  it('puts the route back at the lineup spot when the motion is cleared', () => {
    state().setRoute(idOf('Y'), 'out')
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -3, y: -2 })
    state().stopFreehand()
    state().clearRoute(idOf('Y'), 'motion')
    expect(motion('Y')).toBeUndefined()
    expect(drawn('Y')[0]).toEqual({ x: -8, y: -1 })
    expect(drawn('Y').at(-1)).toEqual({ x: -13, y: 5 })
  })

  it('travels with the player when they are dragged', () => {
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -4, y: -2 })
    state().stopFreehand()
    state().movePlayer(idOf('Y'), { x: -10, y: -1 })
    expect(drawn('Y', motion('Y')!)).toEqual([
      { x: -10, y: -1 },
      { x: -6, y: -2 },
    ])
  })
})

describe('QB run if blitzed', () => {
  it('has roll out and step up', () => {
    expect(BLITZ_RUNS.map((r) => r.id)).toEqual(['roll', 'stepUp'])
  })

  it('sits alongside whatever else the QB is doing', () => {
    state().setHandoff(idOf('QB'), idOf('RB'))
    state().setRoute(idOf('QB'), 'roll')
    expect(blitz('QB')).toMatchObject({ kind: 'qbRunIfBlitzed', routeName: 'roll' })
    expect(main('QB')!.kind).toBe('handoff')
  })

  it('rolls right by default and left when flipped', () => {
    state().setRoute(idOf('QB'), 'roll')
    expect(drawn('QB', blitz('QB')!)).toEqual([
      { x: 0, y: -5 },
      { x: 5, y: -5 },
      { x: 7, y: -3 },
      { x: 7, y: 2 },
    ])
    state().flipRoute(idOf('QB'), 'blitz')
    expect(drawn('QB', blitz('QB')!).at(-1)).toEqual({ x: -7, y: 2 })
  })

  it('changes depth and clears without touching the main assignment', () => {
    state().setRoute(idOf('QB'), 'stepUp')
    state().setRouteDepth(idOf('QB'), 6, 'blitz')
    expect(drawn('QB', blitz('QB')!).at(-1)).toEqual({ x: 0, y: 6 })
    state().clearRoute(idOf('QB'), 'blitz')
    expect(blitz('QB')).toBeUndefined()
  })

  it('can be drawn by hand', () => {
    state().startFreehand(idOf('QB'), 'qbRunIfBlitzed')
    state().addWaypoint({ x: -6, y: -4 })
    state().addWaypoint({ x: -8, y: 3 })
    state().stopFreehand()
    expect(blitz('QB')!.path).toHaveLength(2)
  })

  it('is offered only when the rules profile allows it', () => {
    useEditor.setState({ rules: { ...state().rules, qbRunOnBlitz: false } })
    state().setRoute(idOf('QB'), 'roll')
    state().startFreehand(idOf('QB'), 'qbRunIfBlitzed')
    expect(blitz('QB')).toBeUndefined()
    expect(state().drawingFor).toBeNull()

    useEditor.setState({ rules: { ...state().rules, qbRunOnBlitz: true, blitzAllowed: false } })
    state().setRoute(idOf('QB'), 'roll')
    expect(blitz('QB')).toBeUndefined()
  })
})

describe('read order', () => {
  it('numbers the QB’s progression 1, 2, 3', () => {
    state().setRoute(idOf('Y'), 'in')
    state().setRoute(idOf('Z'), 'corner')
    state().setRoute(idOf('C'), 'hitch')
    state().setReadOrder(idOf('Y'), 1)
    state().setReadOrder(idOf('Z'), 2)
    state().setReadOrder(idOf('C'), 3)
    expect([main('Y')!.readOrder, main('Z')!.readOrder, main('C')!.readOrder]).toEqual([1, 2, 3])
  })

  it('gives each number to one player only', () => {
    state().setRoute(idOf('Y'), 'in')
    state().setRoute(idOf('Z'), 'corner')
    state().setReadOrder(idOf('Y'), 1)
    state().setReadOrder(idOf('Z'), 1)
    expect(main('Z')!.readOrder).toBe(1)
    expect(main('Y')!.readOrder).toBeUndefined()
    // Taking the number and losing it is one undo step.
    undo()
    expect(main('Y')!.readOrder).toBe(1)
    expect(main('Z')!.readOrder).toBeUndefined()
  })

  it('takes a player out of the progression', () => {
    state().setRoute(idOf('Y'), 'in')
    state().setReadOrder(idOf('Y'), 2)
    state().setReadOrder(idOf('Y'), null)
    expect('readOrder' in main('Y')!).toBe(false)
  })

  it('stays within 1 to 3 and survives a change of route', () => {
    state().setRoute(idOf('Y'), 'in')
    state().setReadOrder(idOf('Y'), 9)
    expect(main('Y')!.readOrder).toBe(3)
    state().setRoute(idOf('Y'), 'post')
    expect(main('Y')!.readOrder).toBe(3)
  })

  it('applies only to pass routes', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setReadOrder(idOf('RB'), 1)
    expect(main('RB')!.readOrder).toBeUndefined()
    state().setReadOrder(idOf('X'), 1)
    expect(main('X')).toBeUndefined()
  })
})
