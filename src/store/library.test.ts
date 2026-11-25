import { beforeEach, describe, expect, it } from 'vitest'
import { getAssignment } from '../routes/assignments'
import { redo, resetEditor, undo, useEditor } from './editorStore'

const state = () => useEditor.getState()
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id
const history = () => useEditor.temporal.getState()
const names = () => state().plays.map((p) => p.name)
const inBook = (id = state().play.id) => state().plays.find((p) => p.id === id)!

beforeEach(resetEditor)

describe('the playbook keeps up with the editor', () => {
  it('starts with one play, which is the one being edited', () => {
    expect(state().plays).toHaveLength(1)
    expect(state().plays[0]).toBe(state().play)
  })

  it('holds every edit as soon as it is made, with no save step', () => {
    state().setRoute(idOf('Y'), 'out')
    expect(inBook()).toBe(state().play)
    expect(inBook().assignments).toHaveLength(1)
  })

  it('follows undo and redo', () => {
    state().setRoute(idOf('Y'), 'out')
    undo()
    expect(inBook().assignments).toHaveLength(0)
    redo()
    expect(inBook().assignments).toHaveLength(1)
    expect(inBook()).toBe(state().play)
  })
})

describe('new, open, duplicate, delete', () => {
  it('adds a blank play with the next call number and opens it', () => {
    state().newPlay()
    expect(state().plays).toHaveLength(2)
    expect(state().play.number).toBe(2)
    expect(state().play.assignments).toHaveLength(0)
  })

  it('switches between plays without losing either one’s work', () => {
    const first = state().play.id
    state().setRoute(idOf('Y'), 'out')
    state().newPlay()
    const second = state().play.id
    state().setRoute(idOf('Z'), 'post')

    state().openPlay(first)
    expect(getAssignment(state().play, idOf('Y'))!.routeName).toBe('out')
    expect(getAssignment(state().play, idOf('Z'))).toBeUndefined()

    state().openPlay(second)
    expect(getAssignment(state().play, idOf('Z'))!.routeName).toBe('post')
  })

  it('starts undo over when the play changes, so undo never reaches into another play', () => {
    const first = state().play.id
    state().setRoute(idOf('Y'), 'out')
    state().newPlay()
    expect(history().pastStates).toHaveLength(0)
    undo()
    expect(state().play.number).toBe(2)
    expect(inBook(first).assignments).toHaveLength(1)
  })

  it('clears the selection and stops drawing when the play changes', () => {
    state().startFreehand(idOf('Z'))
    state().addWaypoint({ x: 8, y: 4 })
    const first = state().play.id
    state().newPlay()
    expect(state().drawingFor).toBeNull()
    expect(state().selectedId).toBeNull()
    // The route drawn so far was kept.
    expect(inBook(first).assignments).toHaveLength(1)
  })

  it('duplicates a play and opens the copy', () => {
    state().renamePlay('Smash')
    state().setRoute(idOf('Y'), 'corner')
    const original = state().play.id
    state().duplicatePlay(original)
    expect(names()).toEqual(['Smash', 'Smash copy'])
    expect(state().play.id).not.toBe(original)
    expect(state().play.number).toBe(2)

    // Changing the copy leaves the original alone.
    state().setRoute(idOf('Y'), 'go')
    expect(getAssignment(inBook(original), idOf('Y'))!.routeName).toBe('corner')
  })

  it('mirrors a play into a new one and opens it', () => {
    state().renamePlay('Flood')
    state().loadFormation('trips')
    state().setRoute(idOf('W'), 'out')
    const original = state().play.id
    state().mirrorPlay(original)
    expect(names()).toEqual(['Flood', 'Flood (mirror)'])
    expect(state().play.mirroredFrom).toBe(original)
    expect(state().play.formation).toBe('Trips Left')
    expect(state().play.players.find((p) => p.label === 'W')!.start).toEqual({ x: -17, y: -1 })
    expect(inBook(original).formation).toBe('Trips Right')
  })

  it('deletes the open play and opens the next one', () => {
    state().renamePlay('One')
    state().newPlay()
    state().renamePlay('Two')
    state().newPlay()
    state().renamePlay('Three')
    state().openPlay(state().plays[1].id)
    state().deletePlay(state().play.id)
    expect(names()).toEqual(['One', 'Three'])
    expect(state().play.name).toBe('Three')
  })

  it('opens the previous play when the last one in the list is deleted', () => {
    state().renamePlay('One')
    state().newPlay()
    state().renamePlay('Two')
    state().deletePlay(state().play.id)
    expect(state().play.name).toBe('One')
  })

  it('deletes another play without disturbing the open one or its undo history', () => {
    state().renamePlay('One')
    const first = state().play.id
    state().newPlay()
    state().setRoute(idOf('Y'), 'out')
    state().deletePlay(first)
    expect(state().plays).toHaveLength(1)
    expect(history().pastStates).toHaveLength(1)
  })

  it('never leaves the playbook empty', () => {
    state().renamePlay('Only')
    state().deletePlay(state().play.id)
    expect(state().plays).toHaveLength(1)
    expect(state().play.name).toBe('New play')
    expect(state().plays[0]).toBe(state().play)
  })
})

describe('rename, number, tag', () => {
  it('renames the play, and typing a name is one undo step', () => {
    for (const name of ['M', 'Me', 'Mes', 'Mesh']) state().renamePlay(name)
    expect(inBook().name).toBe('Mesh')
    expect(history().pastStates).toHaveLength(1)
    undo()
    expect(state().play.name).toBe('New play')
  })

  it('sets the call number within 1 to 999', () => {
    state().setPlayNumber(12)
    expect(inBook().number).toBe(12)
    state().setPlayNumber(0)
    expect(state().play.number).toBe(1)
    state().setPlayNumber(5000)
    expect(state().play.number).toBe(999)
    state().setPlayNumber(Number.NaN)
    expect(state().play.number).toBe(999)
  })

  it('adds and removes tags, cleaned up', () => {
    state().toggleTag('  Red   Zone ')
    state().toggleTag('pass')
    expect(inBook().tags).toEqual(['red zone', 'pass'])
    state().toggleTag('RED ZONE')
    expect(state().play.tags).toEqual(['pass'])
    state().toggleTag('   ')
    expect(state().play.tags).toEqual(['pass'])
  })

  it('renames the playbook without adding an undo step', () => {
    state().renamePlaybook('Fall League')
    expect(state().playbookName).toBe('Fall League')
    expect(history().pastStates).toHaveLength(0)
  })
})
