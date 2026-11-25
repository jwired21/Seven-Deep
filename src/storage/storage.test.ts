import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RULES, DEFAULT_WRIST_COACH, feet } from '../model/defaults'
import type { Playbook } from '../model/types'
import { getAssignment } from '../routes/assignments'
import { resetEditor, toPlaybook, useEditor } from '../store/editorStore'
import { startPersistence } from './persistence'
import { exportFileName, exportPlaybook, importPlaybook, parsePlaybook, PlaybookFormatError } from './playbookFile'
import { indexedDbStorage, memoryStorage } from './playbookStorage'

const state = () => useEditor.getState()
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id

/** A playbook with two plays that uses every kind of assignment. */
function buildPlaybook(): Playbook {
  resetEditor()
  state().renamePlaybook('Tuesday Night')
  state().renamePlay('Mesh Flood')
  state().toggleTag('pass')
  state().toggleTag('Red Zone')
  state().loadFormation('trips')
  state().setRoute(idOf('Y'), 'in')
  state().setReadOrder(idOf('Y'), 1)
  state().setRoute(idOf('C'), 'hitch')
  state().setDelay(idOf('C'), 1)
  state().flipRoute(idOf('C'))
  state().setRoute(idOf('QB'), 'roll')
  state().startFreehand(idOf('Z'), 'motion')
  state().addWaypoint({ x: 6, y: -2 })
  state().stopFreehand()
  state().startFreehand(idOf('W'))
  state().addWaypoint({ x: 17, y: 4 })
  state().addWaypoint({ x: 12, y: 8 })
  state().stopFreehand()

  state().newPlay()
  state().renamePlay('Sweep Right')
  state().toggleTag('run')
  state().setBallOn(feet(20))
  state().setRoute(idOf('RB'), 'sweep')
  state().setHandoff(idOf('QB'), idOf('RB'))
  state().setRules({ noRunZone: 5 })
  return structuredClone(toPlaybook(state()))
}

beforeEach(resetEditor)

describe('export and import', () => {
  it('re-imports an export as exactly the same playbook', () => {
    const playbook = buildPlaybook()
    expect(importPlaybook(exportPlaybook(playbook))).toEqual(playbook)
  })

  it('writes a readable file that names the app and the date', () => {
    const playbook = buildPlaybook()
    const file = JSON.parse(exportPlaybook(playbook, new Date('2026-11-25T12:00:00Z')))
    expect(file).toMatchObject({ app: 'seven-deep', schemaVersion: 1, exportedAt: '2026-11-25T12:00:00.000Z' })
    expect(file.playbook.plays).toHaveLength(2)
    expect(exportFileName('Tuesday Night!', new Date('2026-11-25T12:00:00Z'))).toBe('tuesday-night-2026-11-25.json')
    expect(exportFileName('', new Date('2026-11-25T12:00:00Z'))).toBe('playbook-2026-11-25.json')
  })

  it('stores everything in yards', () => {
    const text = exportPlaybook(buildPlaybook())
    expect(text).not.toMatch(/px|pixel/i)
    // The 20-foot spot is saved as 6⅔ yards.
    expect(JSON.parse(text).playbook.plays[1].ballOn).toBeCloseTo(6.6667, 4)
  })

  it('accepts a bare playbook without the file wrapper', () => {
    const playbook = buildPlaybook()
    expect(importPlaybook(JSON.stringify(playbook))).toEqual(playbook)
  })

  it('loads an imported playbook into the editor', () => {
    const playbook = buildPlaybook()
    resetEditor()
    state().loadPlaybook(importPlaybook(exportPlaybook(playbook)))
    expect(state().playbookName).toBe('Tuesday Night')
    expect(state().plays.map((p) => p.name)).toEqual(['Mesh Flood', 'Sweep Right'])
    // Opens the lowest call number, with nothing to undo.
    expect(state().play.name).toBe('Mesh Flood')
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
    expect(state().rules.noRunZone).toBe(5)
    expect(getAssignment(state().play, idOf('C'))).toMatchObject({ routeName: 'hitch', delayCounts: 1, routeFlipped: true })
  })

  it('rejects files that are not playbooks, with a message a person can act on', () => {
    expect(() => importPlaybook('not json')).toThrow(PlaybookFormatError)
    expect(() => importPlaybook('not json')).toThrow(/not valid JSON/)
    expect(() => importPlaybook('[1, 2]')).toThrow(PlaybookFormatError)
    expect(() => importPlaybook('{"hello": "world"}')).toThrow(/not a playbook file/)
  })

  it('rejects a file from a newer version instead of guessing', () => {
    const playbook = { ...buildPlaybook(), schemaVersion: 2 }
    expect(() => importPlaybook(JSON.stringify(playbook))).toThrow(/newer version/)
  })

  it('names the play and the problem when a play is damaged', () => {
    const playbook = buildPlaybook()
    const short = structuredClone(playbook)
    short.plays[1].players.pop()
    expect(() => parsePlaybook(short)).toThrow('Play 2 has 6 players. A play needs 7.')

    const badPoint = structuredClone(playbook) as unknown as { plays: { players: { start: unknown }[] }[] }
    badPoint.plays[0].players[2].start = { x: 'left', y: 0 }
    expect(() => parsePlaybook(badPoint)).toThrow(/Play 1 player 3 start x must be a number/)

    const stranger = structuredClone(playbook)
    stranger.plays[0].assignments[0].playerId = 'nobody'
    expect(() => parsePlaybook(stranger)).toThrow(/not in the play/)
  })

  it('drops fields it does not know and never keeps a reference to the input', () => {
    const playbook = buildPlaybook()
    const noisy = structuredClone(playbook) as Playbook & { extra?: string }
    noisy.extra = 'ignore me'
    ;(noisy.plays[0] as unknown as Record<string, unknown>).pixels = [1, 2, 3]
    const parsed = parsePlaybook(noisy)
    expect(parsed).toEqual(playbook)
    expect(parsed.plays[0]).not.toBe(noisy.plays[0])
  })

  it('fills in settings an older file does not have', () => {
    const old = structuredClone(buildPlaybook()) as unknown as { rules: Record<string, unknown>; wristCoach: unknown }
    delete old.rules.blitzesPerGame
    delete old.rules.fieldLength
    old.rules.fieldWidth = 'wide'
    old.wristCoach = undefined
    const parsed = parsePlaybook(old)
    expect(parsed.rules.blitzesPerGame).toBe(DEFAULT_RULES.blitzesPerGame)
    expect(parsed.rules.fieldLength).toBe(DEFAULT_RULES.fieldLength)
    expect(parsed.rules.fieldWidth).toBe(DEFAULT_RULES.fieldWidth)
    expect(parsed.rules.noRunZone).toBe(5)
    expect(parsed.wristCoach).toEqual(DEFAULT_WRIST_COACH)
  })

  it('keeps a setting that is switched off with null', () => {
    const playbook = structuredClone(buildPlaybook())
    playbook.rules.qbRunAfterSeconds = null
    playbook.rules.maxMales = null
    expect(parsePlaybook(playbook).rules).toMatchObject({ qbRunAfterSeconds: null, maxMales: null })
  })
})

describe('browser storage', () => {
  it('reads back from IndexedDB exactly what was saved', async () => {
    const playbook = buildPlaybook()
    const name = `test-${crypto.randomUUID()}`
    await indexedDbStorage(name).save(playbook)
    // A second connection, as after a refresh.
    expect(await indexedDbStorage(name).load()).toEqual(playbook)
  })

  it('returns nothing on a first visit', async () => {
    expect(await indexedDbStorage(`test-${crypto.randomUUID()}`).load()).toBeNull()
  })
})

describe('autosave', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('saves edits without a save button, and a refresh loses nothing', async () => {
    const name = `test-${crypto.randomUUID()}`
    const first = await startPersistence(indexedDbStorage(name), 0)
    expect(state().hydrated).toBe(true)

    state().renamePlay('Four Verts')
    for (const label of ['X', 'Y', 'Z', 'W']) state().setRoute(idOf(label), 'go')
    state().newPlay()
    state().renamePlay('Draw')
    await first.flush()
    const before = structuredClone(toPlaybook(state()))
    first.stop()

    // Refresh: the editor starts from scratch, then reads storage.
    resetEditor()
    expect(state().plays).toHaveLength(1)
    const second = await startPersistence(indexedDbStorage(name), 0)
    expect(toPlaybook(state())).toEqual(before)
    expect(state().plays.map((p) => p.name)).toEqual(['Four Verts', 'Draw'])
    second.stop()
  })

  it('saves shortly after a change and reports the status', async () => {
    const storage = memoryStorage()
    const persistence = await startPersistence(storage, 0)
    expect(storage.saves).toBe(0)

    state().renamePlay('Smash')
    expect(state().saveStatus).toBe('saving')
    await tick()
    await tick()
    expect(storage.saves).toBe(1)
    expect(state().saveStatus).toBe('saved')
    persistence.stop()
  })

  it('saves undo and redo too, since they change the play', async () => {
    const storage = memoryStorage()
    const persistence = await startPersistence(storage, 0)
    state().setRoute(idOf('Y'), 'out')
    useEditor.temporal.getState().undo()
    await persistence.flush()
    const saved = parsePlaybook(await storage.load())
    expect(saved.plays[0].assignments).toHaveLength(0)
    persistence.stop()
  })

  it('does not save selection or drawing mode', async () => {
    const storage = memoryStorage()
    const persistence = await startPersistence(storage, 0)
    state().select(idOf('QB'))
    await tick()
    expect(storage.saves).toBe(0)
    persistence.stop()
  })

  it('sets aside a saved playbook it cannot read instead of overwriting it', async () => {
    const storage = memoryStorage({ schemaVersion: 1, plays: 'broken' })
    const persistence = await startPersistence(storage, 0)
    expect(storage.quarantined).toHaveLength(1)
    expect(state().hydrated).toBe(true)
    expect(state().plays).toHaveLength(1)
    persistence.stop()
  })

  it('reports a failed save and tries again on the next change', async () => {
    const storage = memoryStorage()
    let failing = true
    const save = storage.save.bind(storage)
    storage.save = async (playbook) => {
      if (failing) throw new Error('quota')
      return save(playbook)
    }
    const persistence = await startPersistence(storage, 0)
    state().renamePlay('A')
    await persistence.flush()
    expect(state().saveStatus).toBe('error')

    failing = false
    await persistence.flush()
    expect(state().saveStatus).toBe('saved')
    expect(parsePlaybook(await storage.load()).plays[0].name).toBe('A')
    persistence.stop()
  })
})
