import { beforeEach, describe, expect, it } from 'vitest'
import { endCoalescing, redo, resetEditor, undo, useEditor } from './editorStore'

const state = () => useEditor.getState()
const at = (label: string) => state().play.players.find((p) => p.label === label)!.start
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id
const history = () => useEditor.temporal.getState()

beforeEach(resetEditor)

describe('editor store', () => {
  it('starts with 7 players in spread and nothing to undo', () => {
    expect(state().play.players).toHaveLength(7)
    expect(state().play.formation).toBe('Spread')
    expect(history().pastStates).toHaveLength(0)
  })

  it('snaps a moved player to the 1-yard grid', () => {
    state().movePlayer(idOf('Y'), { x: -5.4, y: -2.6 })
    expect(at('Y')).toEqual({ x: -5, y: -3 })
  })

  it('keeps a moved player behind the line of scrimmage and in bounds', () => {
    state().movePlayer(idOf('Z'), { x: 44, y: 6 })
    expect(at('Z')).toEqual({ x: 20, y: -1 })
  })

  it('undoes and redoes a move', () => {
    state().movePlayer(idOf('X'), { x: -10, y: -4 })
    undo()
    expect(at('X')).toEqual({ x: -16, y: -1 })
    redo()
    expect(at('X')).toEqual({ x: -10, y: -4 })
  })

  it('undoes moves one at a time, newest first', () => {
    state().movePlayer(idOf('X'), { x: -10, y: -4 })
    state().movePlayer(idOf('RB'), { x: -3, y: -6 })
    undo()
    expect(at('RB')).toEqual({ x: 3, y: -5 })
    expect(at('X')).toEqual({ x: -10, y: -4 })
    undo()
    expect(at('X')).toEqual({ x: -16, y: -1 })
  })

  it('adds no undo step when a drop lands on the spot the player already had', () => {
    state().movePlayer(idOf('C'), { x: 0.3, y: -0.8 })
    expect(history().pastStates).toHaveLength(0)
  })

  it('loads a formation as one undo step', () => {
    state().loadFormation('trips')
    expect(state().play.formation).toBe('Trips Right')
    expect(at('W')).toEqual({ x: 17, y: -1 })
    expect(history().pastStates).toHaveLength(1)

    undo()
    expect(state().play.formation).toBe('Spread')
    expect(at('W')).toEqual({ x: 16, y: -1 })
  })

  it('loads a formation over hand-placed players', () => {
    state().movePlayer(idOf('QB'), { x: 4, y: -8 })
    state().loadFormation('stack')
    expect(at('QB')).toEqual({ x: 0, y: -5 })
    undo()
    expect(at('QB')).toEqual({ x: 4, y: -8 })
  })

  it('flips a formation and undoes it', () => {
    state().loadFormation('bunch')
    state().flipFormation()
    expect(state().play.formation).toBe('Bunch Left')
    expect(at('Z')).toEqual({ x: -10, y: -1 })
    undo()
    expect(state().play.formation).toBe('Bunch Right')
    expect(at('Z')).toEqual({ x: 10, y: -1 })
  })

  it('loads empty and flips the back across the center', () => {
    state().loadFormation('empty')
    expect(state().play.formation).toBe('Empty Left')
    expect(at('RB')).toEqual({ x: -4, y: -1 })
    state().flipFormation()
    expect(state().play.formation).toBe('Empty Right')
    expect(at('RB')).toEqual({ x: 4, y: -1 })
    expect(at('Y')).toEqual({ x: -8, y: -1 })
    expect(at('Z')).toEqual({ x: 8, y: -1 })
  })

  it('does not record selection or rules changes as undo steps', () => {
    state().select(idOf('QB'))
    state().setRules({ noRunZone: 5 })
    expect(history().pastStates).toHaveLength(0)

    state().movePlayer(idOf('QB'), { x: 0, y: -7 })
    undo()
    expect(state().selectedId).toBe(idOf('QB'))
    expect(state().rules.noRunZone).toBe(5)
  })

  it('treats one drag of the ball slider as a single undo step', () => {
    for (const yd of [13, 14, 15, 16, 20]) state().setBallOn(yd)
    expect(history().pastStates).toHaveLength(1)
    undo()
    expect(state().play.ballOn).toBe(12)
  })

  it('starts a new undo step after the slider is released', () => {
    state().setBallOn(20)
    endCoalescing()
    state().setBallOn(30)
    undo()
    expect(state().play.ballOn).toBe(20)
    undo()
    expect(state().play.ballOn).toBe(12)
  })

  it('does not merge a ball move into an earlier one when a player moved in between', () => {
    state().setBallOn(20)
    state().movePlayer(idOf('X'), { x: -10, y: -1 })
    state().setBallOn(25)
    expect(history().pastStates).toHaveLength(3)
  })

  it('drops the redo stack when a new edit follows an undo', () => {
    state().movePlayer(idOf('X'), { x: -10, y: -4 })
    undo()
    state().movePlayer(idOf('X'), { x: -12, y: -2 })
    expect(history().futureStates).toHaveLength(0)
    redo()
    expect(at('X')).toEqual({ x: -12, y: -2 })
  })
})
