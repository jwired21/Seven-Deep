import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RULES, feet } from '../model/defaults'
import type { Play, RulesProfile } from '../model/types'
import { absolutePath, getAssignment } from '../routes/assignments'
import { resetEditor, undo, useEditor } from '../store/editorStore'
import { checkPlay, femalePlay, inNoRunZone, isRunPlay } from './checkPlay'
import { fitPlayToRules, rulesSummary, sanitizeRules, tidyYd } from './rules'

const state = () => useEditor.getState()
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id
const ids = (play: Play = state().play, rules: RulesProfile = state().rules) => checkPlay(play, rules).map((w) => w.id)

beforeEach(resetEditor)

describe('the check that proves the phase', () => {
  it('warns about a run play at the 3-yard line', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
    state().setBallOn(3)
    const warnings = checkPlay(state().play, state().rules)
    expect(warnings.map((w) => w.id)).toContain('no-run-zone')
    expect(warnings[0].message).toBe(
      'Run play inside the no-run zone. With the ball on the 3, it must be passed across the line of scrimmage.',
    )
  })

  it('warns and does not block: the run play is still there', () => {
    state().setBallOn(3)
    state().setRoute(idOf('RB'), 'dive')
    expect(getAssignment(state().play, idOf('RB'))!.kind).toBe('run')
    expect(ids()).toEqual(['no-run-zone'])
  })
})

describe('no-run zone', () => {
  it('does not warn about a run outside the zone', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setBallOn(4)
    expect(ids()).toEqual([])
  })

  it('does not warn about a pass play inside the zone', () => {
    state().setBallOn(3)
    state().setRoute(idOf('Y'), 'slant')
    expect(ids()).toEqual([])
  })

  it('counts the 10-foot line itself as inside the zone', () => {
    state().setRoute(idOf('RB'), 'dive')
    state().setBallOn(feet(10))
    expect(inNoRunZone(state().play, state().rules)).toBe(true)
    expect(ids()).toEqual(['no-run-zone'])
  })

  it('follows the profile: a 10-yard zone catches a run from the 8, and no zone catches nothing', () => {
    state().setRoute(idOf('RB'), 'dive')
    state().setBallOn(8)
    expect(ids()).toEqual([])
    state().setRules({ noRunZone: 10 })
    expect(ids()).toEqual(['no-run-zone'])
    state().setRules({ noRunZone: 0 })
    state().setBallOn(1)
    expect(ids()).toEqual([])
  })

  it('treats a handoff as a run play, and a QB run if blitzed as not one', () => {
    state().setRoute(idOf('QB'), 'roll')
    expect(isRunPlay(state().play)).toBe(false)
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(isRunPlay(state().play)).toBe(true)
  })
})

describe('other rule checks', () => {
  it('flags a handoff when the profile does not allow them', () => {
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(ids()).toEqual([])
    state().setRules({ handoffsAllowed: false })
    expect(ids()).toEqual(['handoff'])
  })

  it('flags a QB run if blitzed when blitzing or the QB run is switched off', () => {
    state().setRoute(idOf('QB'), 'roll')
    expect(ids()).toEqual([])
    state().setRules({ qbRunOnBlitz: false })
    expect(ids()).toEqual(['blitz-run'])
    state().setRules({ qbRunOnBlitz: true, blitzAllowed: false })
    expect(ids()).toEqual(['blitz-run'])
  })

  it('flags motion that heads toward the line of scrimmage at the snap', () => {
    state().movePlayer(idOf('Y'), { x: -8, y: -4 })
    state().startFreehand(idOf('Y'), 'motion')
    state().addWaypoint({ x: -5, y: -4 })
    expect(ids()).toEqual([])
    state().addWaypoint({ x: -3, y: -2 })
    expect(ids()).toEqual([`motion-${idOf('Y')}`])
    // Finishing sideways or backward is fine.
    state().addWaypoint({ x: 0, y: -2 })
    expect(ids()).toEqual([])
  })

  it('reminds that a designed QB run needs a blitz or the count', () => {
    state().setRoute(idOf('QB'), 'dive')
    const [warning] = checkPlay(state().play, state().rules)
    expect(warning.id).toBe('qb-run')
    expect(warning.message).toBe('The QB has a designed run. The QB can only run when blitzed or after the 5-count.')
  })

  it('does not flag the QB running after getting the ball back on a handoff', () => {
    state().setRoute(idOf('QB'), 'sweep')
    state().setHandoff(idOf('RB'), idOf('QB'))
    expect(ids()).toEqual([])
  })

  it('flags a route for the center when the center is not eligible', () => {
    state().setRoute(idOf('C'), 'hitch')
    expect(ids()).toEqual([])
    state().setRules({ allEligible: false })
    expect(ids()).toEqual(['center'])
  })

  it('flags a blocking assignment when blocking is not allowed', () => {
    const play: Play = { ...state().play, assignments: [{ playerId: idOf('C'), kind: 'block', path: [] }] }
    expect(ids(play)).toEqual(['block'])
    expect(ids(play, { ...DEFAULT_RULES, blockingAllowed: true })).toEqual([])
  })

  it('can report several problems at once', () => {
    state().setRoute(idOf('RB'), 'dive')
    state().setHandoff(idOf('QB'), idOf('RB'))
    state().setBallOn(2)
    state().setRules({ handoffsAllowed: false })
    expect(ids()).toEqual(['no-run-zone', 'handoff'])
  })
})

describe('coed rules', () => {
  const setGenders = (genders: Record<string, 'M' | 'F'>) => {
    for (const [label, gender] of Object.entries(genders)) state().setGender(idOf(label), gender)
  }

  it('flags more males than the limit', () => {
    setGenders({ QB: 'M', C: 'M', RB: 'M', X: 'M', Y: 'F', Z: 'F', W: 'F' })
    expect(ids()).toEqual([])
    state().setGender(idOf('Y'), 'M')
    expect(checkPlay(state().play, state().rules)).toEqual([{ id: 'males', message: '5 males on the field. The limit is 4.' }])
    state().setRules({ maxMales: null })
    expect(ids()).toEqual([])
  })

  it('cannot judge a female play until genders are set', () => {
    expect(femalePlay(state().play).status).toBe('unknown')
  })

  it('counts a pass thrown by a female QB', () => {
    setGenders({ QB: 'F', Y: 'M' })
    expect(femalePlay(state().play)).toEqual({ status: 'yes', reason: 'The QB throws it.' })
  })

  it('counts a pass whose first read is female, and not one whose first read is male', () => {
    setGenders({ QB: 'M', Y: 'F', Z: 'M' })
    state().setRoute(idOf('Y'), 'in')
    state().setRoute(idOf('Z'), 'post')
    expect(femalePlay(state().play).status).toBe('unknown')
    state().setReadOrder(idOf('Y'), 1)
    expect(femalePlay(state().play)).toEqual({ status: 'yes', reason: 'Y is the first read.' })
    state().setReadOrder(idOf('Z'), 1)
    expect(femalePlay(state().play).status).toBe('no')
  })

  it('goes by who carries the ball on a run play', () => {
    setGenders({ QB: 'F', RB: 'M', X: 'F' })
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(femalePlay(state().play)).toEqual({ status: 'no', reason: 'RB, who carries the ball, is not female.' })
    state().setRoute(idOf('X'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('X'))
    expect(femalePlay(state().play).status).toBe('yes')
  })

  it('sets a player’s gender in every play of the playbook, and new plays inherit it', () => {
    state().newPlay()
    state().setGender(idOf('Y'), 'F')
    expect(state().plays.every((p) => p.players.find((x) => x.label === 'Y')!.gender === 'F')).toBe(true)
    state().newPlay()
    expect(state().play.players.find((p) => p.label === 'Y')!.gender).toBe('F')
    state().setGender(idOf('Y'), null)
    expect(state().plays.every((p) => !('gender' in p.players.find((x) => x.label === 'Y')!))).toBe(true)
  })
})

describe('editing the rules profile', () => {
  it('changes a setting without adding an undo step', () => {
    state().setRules({ blitzesPerGame: 3, name: 'Fall League' })
    expect(state().rules).toMatchObject({ blitzesPerGame: 3, name: 'Fall League' })
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })

  it('turns thirds of a yard typed as decimals into exact thirds', () => {
    expect(tidyYd(3.33)).toBeCloseTo(10 / 3, 12)
    expect(tidyYd(66.67)).toBeCloseTo(200 / 3, 12)
    expect(tidyYd(8.3)).toBe(8.3)
    expect(tidyYd(40)).toBe(40)
  })

  it('keeps every setting in a sane range', () => {
    const wild = sanitizeRules({
      ...DEFAULT_RULES,
      fieldWidth: 500,
      fieldLength: 5,
      endZoneDepth: 99,
      noRunZone: 80,
      blitzesPerGame: -2,
      qbRunAfterSeconds: 2.6,
      maxMales: 12,
    })
    expect(wild.fieldWidth).toBe(60)
    expect(wild.endZoneDepth).toBe(15)
    // Always at least 10 yards between the goal lines.
    expect(wild.fieldLength).toBe(40)
    expect(wild.noRunZone).toBe(5)
    expect(wild.blitzesPerGame).toBe(0)
    expect(wild.qbRunAfterSeconds).toBe(3)
    expect(wild.maxMales).toBe(7)
  })

  it('keeps null for settings that are switched off', () => {
    const off = sanitizeRules({ ...DEFAULT_RULES, blitzesPerGame: null, qbRunAfterSeconds: null })
    expect(off.blitzesPerGame).toBeNull()
    expect(off.qbRunAfterSeconds).toBeNull()
  })

  it('refits every play when the field gets narrower', () => {
    state().setRoute(idOf('W'), 'out')
    const first = state().play.id
    state().newPlay()
    state().setRules({ fieldWidth: 30 })
    for (const play of state().plays) {
      for (const p of play.players) expect(Math.abs(p.start.x)).toBeLessThanOrEqual(15)
    }
    const one = state().plays.find((p) => p.id === first)!
    const w = one.players.find((p) => p.label === 'W')!
    const path = absolutePath(one, w, getAssignment(one, w.id)!)
    expect(path.every((p) => Math.abs(p.x) <= 15)).toBe(true)
  })

  it('pulls the ball back between the goal lines when the field gets shorter', () => {
    state().setBallOn(45)
    state().setRules({ fieldLength: 60, endZoneDepth: 10 })
    // 40 yards goal line to goal line.
    expect(state().play.ballOn).toBe(39)
  })

  it('starts undo over after the field changes size, so undo cannot bring back an out-of-bounds play', () => {
    state().movePlayer(idOf('W'), { x: 20, y: -1 })
    state().setRules({ fieldWidth: 30 })
    undo()
    expect(state().play.players.find((p) => p.label === 'W')!.start.x).toBe(15)
  })

  it('leaves a play that already fits untouched', () => {
    const play = state().play
    const fitted = fitPlayToRules(play, DEFAULT_RULES)
    expect(fitted.players).toEqual(play.players)
    expect(fitted.ballOn).toBe(play.ballOn)
  })

  it('summarizes the profile in plain lines', () => {
    const lines = rulesSummary(DEFAULT_RULES)
    expect(lines).toContain('Field: 40 × 66⅔ yd, 8⅓ yd end zones')
    expect(lines).toContain('No-run zone: 3⅓ yd from goal line')
    expect(lines).toContain('QB can run on a blitz or after the 5-count')
    expect(rulesSummary({ ...DEFAULT_RULES, blitzAllowed: false, qbRunAfterSeconds: null })).toContain('QB cannot run')
  })
})
