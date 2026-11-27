import { beforeEach, describe, expect, it } from 'vitest'
import { parsePlaybook } from '../storage/playbookFile'
import { resetEditor, toPlaybook, undo, useEditor } from '../store/editorStore'
import { advance, buildTimeline, COUNT_SECONDS, describeTime, passTarget, SPEED } from './timeline'

const state = () => useEditor.getState()
const player = (label: string) => state().play.players.find((p) => p.label === label)!
const idOf = (label: string) => player(label).id
const timeline = (options = {}) => buildTimeline(state().play, options)

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

// Spread: X (-16,-1), Y (-8,-1), C (0,-1), Z (8,-1), W (16,-1), QB (0,-5), RB (3,-5).
beforeEach(resetEditor)

describe('before the snap', () => {
  it('starts with a short pause, everyone at their lineup spot, and the ball on the line', () => {
    const t = timeline()
    expect(t.start).toBeLessThan(0)
    for (const p of state().play.players) close(t.positionOf(p.id, t.start), p.start)
    expect(t.ball(t.start)).toMatchObject({ at: { x: 0, y: 0 }, inAir: false, holderId: null })
  })

  it('moves a player in motion so they set exactly at the snap', () => {
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -4, y: -1 })
    state().stopFreehand()
    const t = timeline()
    // 4 yards at the motion speed.
    const duration = 4 / SPEED.motion
    close(t.positionOf(idOf('Y'), -duration), { x: -8, y: -1 })
    close(t.positionOf(idOf('Y'), -duration / 2), { x: -6, y: -1 })
    close(t.positionOf(idOf('Y'), 0), { x: -4, y: -1 })
    // Playback starts early enough to show the whole motion.
    expect(t.start).toBeLessThan(-duration)
  })

  it('keeps everyone else still during the motion', () => {
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -4, y: -1 })
    state().stopFreehand()
    state().setRoute(idOf('Z'), 'go')
    close(timeline().positionOf(idOf('Z'), -0.5), { x: 8, y: -1 })
  })
})

describe('routes', () => {
  it('runs a route at running speed from the snap', () => {
    state().setRoute(idOf('Z'), 'go')
    const t = timeline()
    close(t.positionOf(idOf('Z'), 1), { x: 8, y: -1 + SPEED.run })
    close(t.positionOf(idOf('Z'), 2), { x: 8, y: -1 + SPEED.run * 2 })
  })

  it('follows the route around its break', () => {
    // A 5-yard out from (-8, -1): 6 yards up to (-8, 5), then out to (-13, 5).
    state().setRoute(idOf('Y'), 'out')
    const t = timeline()
    close(t.positionOf(idOf('Y'), 6 / SPEED.run), { x: -8, y: 5 })
    close(t.positionOf(idOf('Y'), 8 / SPEED.run), { x: -10, y: 5 })
  })

  it('stops at the end of the route and stays there', () => {
    state().setRoute(idOf('Y'), 'out')
    const t = timeline()
    close(t.positionOf(idOf('Y'), 60), { x: -13, y: 5 })
  })

  it('waits out a delayed release, one second per count', () => {
    state().setRoute(idOf('C'), 'go')
    state().setDelay(idOf('C'), 2)
    const t = timeline()
    close(t.positionOf(idOf('C'), 2 * COUNT_SECONDS), { x: 0, y: -1 })
    close(t.positionOf(idOf('C'), 2 * COUNT_SECONDS + 1), { x: 0, y: -1 + SPEED.run })
  })

  it('starts a route from where the motion ended', () => {
    state().setRoute(idOf('Y'), 'go')
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -4, y: -2 })
    state().stopFreehand()
    const t = timeline()
    close(t.positionOf(idOf('Y'), 0.001), { x: -4, y: -2 + 0.001 * SPEED.run })
  })

  it('leaves a player with nothing to do where they are', () => {
    close(timeline().positionOf(idOf('W'), 3), { x: 16, y: -1 })
  })
})

describe('a pass', () => {
  beforeEach(() => {
    state().setRoute(idOf('Y'), 'in')
    state().setRoute(idOf('Z'), 'corner')
    state().setReadOrder(idOf('Y'), 1)
    state().setReadOrder(idOf('Z'), 2)
  })

  it('snaps the ball to the QB', () => {
    const t = timeline()
    const snapTime = 5 / SPEED.snap
    close(t.ball(snapTime / 2).at, { x: 0, y: -2.5 })
    expect(t.ball(snapTime + 0.01)).toMatchObject({ holderId: idOf('QB'), inAir: false })
    close(t.ball(snapTime + 0.01).at, { x: 0, y: -5 })
  })

  it('throws to the first read by default', () => {
    const t = timeline()
    expect(t.targetId).toBe(idOf('Y'))
    expect(passTarget(state().play)!.label).toBe('Y')
  })

  it('throws to whoever is picked instead', () => {
    state().setPassTo(idOf('Z'))
    expect(timeline().targetId).toBe(idOf('Z'))
    state().setPassTo(null)
    expect(timeline().targetId).toBe(idOf('Y'))
  })

  it('times the throw so the ball and the receiver get to the end of the route together', () => {
    const t = timeline()
    // In at 5 from (-8, -1): 6 yards up, 6 across, ending at (-2, 5).
    const arrive = 12 / SPEED.run
    expect(t.catchAt).toBeCloseTo(arrive, 6)
    close(t.positionOf(idOf('Y'), t.catchAt!), { x: -2, y: 5 })
    close(t.ball(t.catchAt!).at, { x: -2, y: 5 })
  })

  it('flies the ball in a straight line at pass speed, in the air the whole way', () => {
    const t = timeline()
    const distance = Math.hypot(-2 - 0, 5 - -5)
    expect(t.catchAt! - t.throwAt!).toBeCloseTo(distance / SPEED.pass, 6)
    const mid = t.ball((t.throwAt! + t.catchAt!) / 2)
    expect(mid.inAir).toBe(true)
    expect(mid.holderId).toBeNull()
    close(mid.at, { x: -1, y: 0 })
    // Highest in the middle of the throw.
    expect(mid.height).toBeCloseTo(1, 6)
    expect(t.ball(t.throwAt! + 0.001).height).toBeLessThan(0.1)
  })

  it('keeps the ball with the QB until the throw and with the receiver after the catch', () => {
    const t = timeline()
    expect(t.ball(t.throwAt! - 0.01).holderId).toBe(idOf('QB'))
    expect(t.ball(t.catchAt! + 0.01)).toMatchObject({ holderId: idOf('Y'), inAir: false })
    expect(t.end).toBeGreaterThan(t.catchAt!)
  })

  it('makes the QB hold the ball a moment even when the route is very short', () => {
    resetEditor()
    state().setRoute(idOf('Y'), 'slant')
    state().setRouteDepth(idOf('Y'), 1)
    state().setReadOrder(idOf('Y'), 1)
    const t = timeline()
    expect(t.throwAt!).toBeGreaterThan(5 / SPEED.snap + 0.4)
  })

  it('leaves the ball with the QB when there is nobody to throw to', () => {
    resetEditor()
    state().setRoute(idOf('Y'), 'in')
    const t = timeline()
    expect(t.targetId).toBeNull()
    expect(t.throwAt).toBeNull()
    expect(t.ball(t.end).holderId).toBe(idOf('QB'))
  })

  it('ignores a picked player who has no route', () => {
    state().setPassTo(idOf('W'))
    expect(timeline().targetId).toBe(idOf('Y'))
  })

  it('runs until every route has finished', () => {
    state().setRoute(idOf('X'), 'go')
    state().setRouteDepth(idOf('X'), 20)
    const t = timeline()
    expect(t.end).toBeGreaterThan(21 / SPEED.run)
  })
})

describe('a run', () => {
  it('hands the ball off as the back passes the QB, then the ball goes with the back', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
    const t = timeline()
    expect(t.throwAt).toBeNull()
    expect(t.ball(0.5).holderId).toBe(idOf('QB'))
    const late = t.ball(2)
    expect(late).toMatchObject({ holderId: idOf('RB'), inAir: false })
    close(late.at, t.positionOf(idOf('RB'), 2))
  })

  it('waits for a delayed back on a draw before the exchange', () => {
    state().movePlayer(idOf('RB'), { x: 1, y: -6 })
    state().setRoute(idOf('RB'), 'dive')
    state().setDelay(idOf('RB'), 2)
    state().setHandoff(idOf('QB'), idOf('RB'))
    const t = timeline()
    expect(t.ball(1.9).holderId).toBe(idOf('QB'))
    // The back starts at 2 s and reaches the QB's depth a yard later.
    expect(t.ball(2 + 1 / SPEED.run + 0.05).holderId).toBe(idOf('RB'))
  })

  it('moves the ball with the QB on a QB run', () => {
    state().setRoute(idOf('QB'), 'dive')
    const t = timeline()
    const at = t.ball(1.5)
    expect(at.holderId).toBe(idOf('QB'))
    close(at.at, t.positionOf(idOf('QB'), 1.5))
    expect(at.at.y).toBeGreaterThan(-5)
  })

  it('pitches to a runner when no handoff was drawn', () => {
    state().setRoute(idOf('RB'), 'sweep')
    const t = timeline()
    expect(t.targetId).toBe(idOf('RB'))
    expect(t.ball(t.end).holderId).toBe(idOf('RB'))
  })

  it('follows a second handoff for a reverse', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
    state().setRoute(idOf('W'), 'sweep')
    state().flipRoute(idOf('W'))
    state().setHandoff(idOf('RB'), idOf('W'))
    const t = timeline()
    expect(t.ball(t.end).holderId).toBe(idOf('W'))
  })
})

describe('showing a blitz', () => {
  beforeEach(() => {
    state().setRoute(idOf('Y'), 'in')
    state().setReadOrder(idOf('Y'), 1)
    state().setRoute(idOf('QB'), 'roll')
  })

  it('throws as usual when the blitz is not shown', () => {
    const t = timeline()
    expect(t.targetId).toBe(idOf('Y'))
    close(t.positionOf(idOf('QB'), 3), { x: 0, y: -5 })
  })

  it('sends the QB down the run-if-blitzed path with the ball, and no throw', () => {
    const t = timeline({ blitz: true })
    expect(t.throwAt).toBeNull()
    expect(t.targetId).toBeNull()
    const late = t.ball(t.end)
    expect(late.holderId).toBe(idOf('QB'))
    close(late.at, { x: 7, y: 2 })
  })

  it('changes nothing for a QB with no run-if-blitzed path', () => {
    state().clearRoute(idOf('QB'), 'blitz')
    expect(timeline({ blitz: true }).targetId).toBe(idOf('Y'))
  })
})

describe('playing and scrubbing', () => {
  const span = { start: -1, end: 4 }

  it('moves forward in real time, or slower at a lower rate', () => {
    expect(advance(0, 0.5, 1, span)).toEqual({ time: 0.5, playing: true })
    expect(advance(0, 0.5, 0.5, span)).toEqual({ time: 0.25, playing: true })
  })

  it('stops at the end of the play', () => {
    expect(advance(3.9, 0.5, 1, span)).toEqual({ time: 4, playing: false })
  })

  it('never goes before the start', () => {
    expect(advance(-5, 0, 1, span).time).toBe(-1)
  })

  it('describes the moment in words', () => {
    expect(describeTime(-0.8)).toBe('Before the snap')
    expect(describeTime(0)).toBe('Snap')
    expect(describeTime(1.44)).toBe('1.4 s')
  })
})

describe('the pass target is part of the play', () => {
  it('is one undo step', () => {
    state().setRoute(idOf('Z'), 'post')
    state().setPassTo(idOf('Z'))
    expect(state().play.passTo).toBe(idOf('Z'))
    undo()
    expect(state().play.passTo).toBeUndefined()
  })

  it('saves and loads with the playbook', () => {
    state().setRoute(idOf('Z'), 'post')
    state().setPassTo(idOf('Z'))
    const saved = parsePlaybook(structuredClone(toPlaybook(state())))
    expect(saved.plays[0].passTo).toBe(idOf('Z'))
  })

  it('is dropped on load when it names someone who is not in the play', () => {
    const playbook = structuredClone(toPlaybook(state()))
    playbook.plays[0].passTo = 'nobody'
    expect(parsePlaybook(playbook).plays[0].passTo).toBeUndefined()
  })

  it('does nothing when set to the same player twice, or to a stranger', () => {
    state().setPassTo(idOf('Z'))
    const pastStates = useEditor.temporal.getState().pastStates.length
    state().setPassTo(idOf('Z'))
    expect(useEditor.temporal.getState().pastStates).toHaveLength(pastStates)
    state().setPassTo('nobody')
    expect(state().play.passTo).toBeUndefined()
  })
})
