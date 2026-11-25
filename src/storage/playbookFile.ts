import { DEFAULT_RULES, DEFAULT_WRIST_COACH } from '../model/defaults'
import type {
  Assignment,
  AssignmentKind,
  Play,
  Playbook,
  Player,
  Point,
  RulesProfile,
  WristCoachLayout,
} from '../model/types'

/** The export file: the playbook plus enough to recognize it. This file is the backup. */
export type PlaybookFile = {
  app: 'seven-deep'
  schemaVersion: 1
  exportedAt: string
  playbook: Playbook
}

/** Thrown when a file or saved record is not a playbook this version can read. The message is for the user. */
export class PlaybookFormatError extends Error {}

const fail = (message: string): never => {
  throw new PlaybookFormatError(message)
}

const KINDS: AssignmentKind[] = ['route', 'run', 'handoff', 'motion', 'qbRunIfBlitzed', 'block', 'none']

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const obj = (v: unknown, what: string): Obj => (isObj(v) ? v : fail(`${what} is missing or not an object.`))
const str = (v: unknown, what: string): string => (typeof v === 'string' ? v : fail(`${what} must be text.`))
const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(`${what} must be a number.`)
const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(`${what} must be a list.`))

const point = (v: unknown, what: string): Point => {
  const o = obj(v, what)
  return { x: num(o.x, `${what} x`), y: num(o.y, `${what} y`) }
}

function player(v: unknown, what: string): Player {
  const o = obj(v, what)
  return {
    id: str(o.id, `${what} id`),
    label: str(o.label, `${what} label`),
    color: str(o.color, `${what} color`),
    start: point(o.start, `${what} start`),
    ...(o.gender === 'M' || o.gender === 'F' ? { gender: o.gender } : {}),
  }
}

function assignment(v: unknown, what: string, playerIds: Set<string>): Assignment {
  const o = obj(v, what)
  const playerId = str(o.playerId, `${what} player`)
  if (!playerIds.has(playerId)) fail(`${what} is for a player who is not in the play.`)
  const kind = KINDS.find((k) => k === o.kind) ?? fail(`${what} has an unknown kind "${String(o.kind)}".`)
  return {
    playerId,
    kind,
    path: list(o.path, `${what} path`).map((p, i) => point(p, `${what} point ${i + 1}`)),
    ...(typeof o.routeName === 'string' ? { routeName: o.routeName } : {}),
    ...(typeof o.routeDepth === 'number' ? { routeDepth: num(o.routeDepth, `${what} depth`) } : {}),
    ...(o.routeFlipped === true ? { routeFlipped: true } : {}),
    ...(typeof o.delayCounts === 'number' ? { delayCounts: num(o.delayCounts, `${what} delay`) } : {}),
    ...(typeof o.readOrder === 'number' ? { readOrder: num(o.readOrder, `${what} read order`) } : {}),
    ...(typeof o.handoffTo === 'string' && playerIds.has(o.handoffTo) ? { handoffTo: o.handoffTo } : {}),
  }
}

function play(v: unknown, index: number): Play {
  const what = `Play ${index + 1}`
  const o = obj(v, what)
  const players = list(o.players, `${what} players`).map((p, i) => player(p, `${what} player ${i + 1}`))
  if (players.length !== 7) fail(`${what} has ${players.length} players. A play needs 7.`)
  const ids = new Set(players.map((p) => p.id))
  if (ids.size !== 7) fail(`${what} has two players with the same id.`)
  const ballOn = num(o.ballOn, `${what} ball position`)
  if (ballOn <= 0) fail(`${what} ball position must be more than 0 yards from the goal line.`)

  return {
    id: str(o.id, `${what} id`),
    number: num(o.number, `${what} number`),
    name: str(o.name, `${what} name`),
    formation: str(o.formation, `${what} formation`),
    tags: list(o.tags ?? [], `${what} tags`).map((t, i) => str(t, `${what} tag ${i + 1}`)),
    ballOn,
    players,
    assignments: list(o.assignments ?? [], `${what} assignments`).map((a, i) =>
      assignment(a, `${what} assignment ${i + 1}`, ids),
    ),
    ...(typeof o.notes === 'string' ? { notes: o.notes } : {}),
    ...(typeof o.mirroredFrom === 'string' ? { mirroredFrom: o.mirroredFrom } : {}),
  }
}

/**
 * Reads settings over a set of defaults. A setting the file does not have, or has with the
 * wrong type, keeps its default, so a file from an older version still loads.
 */
function settings<T extends object>(v: unknown, defaults: T, nullable: (keyof T)[] = []): T {
  if (!isObj(v)) return { ...defaults }
  const out = { ...defaults } as Obj
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = v[key]
    const sameType = typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value))
    // Null switches a setting off, for the few settings that allow it.
    const off = value === null && nullable.includes(key as keyof T)
    if (sameType || off) out[key] = value
  }
  return out as T
}

/** Rules settings that can be null, meaning "no limit" or "never". */
const NULLABLE_RULES: (keyof RulesProfile)[] = ['blitzesPerGame', 'qbRunAfterSeconds', 'maxMales', 'femalePlayEvery']

/** Checks anything, from a file or from browser storage, and returns a clean playbook or throws. */
export function parsePlaybook(value: unknown): Playbook {
  const o = obj(value, 'The playbook')
  if (typeof o.schemaVersion === 'number' && o.schemaVersion > 1) {
    fail('This playbook was saved by a newer version of the app.')
  }
  if (o.schemaVersion !== 1) fail('This is not a playbook file.')

  const plays = list(o.plays, 'The list of plays').map(play)
  if (new Set(plays.map((p) => p.id)).size !== plays.length) fail('Two plays have the same id.')

  // Optional settings that are not in the defaults object still need carrying across.
  const wristCoach = settings<WristCoachLayout>(o.wristCoach, DEFAULT_WRIST_COACH)
  const rawWrist = isObj(o.wristCoach) ? o.wristCoach : {}
  if (typeof rawWrist.playerLabel === 'string') wristCoach.playerLabel = rawWrist.playerLabel
  if (![4, 6, 8, 12].includes(wristCoach.playsPerWindow)) wristCoach.playsPerWindow = DEFAULT_WRIST_COACH.playsPerWindow
  if (wristCoach.mode !== 'qb' && wristCoach.mode !== 'player') wristCoach.mode = DEFAULT_WRIST_COACH.mode

  return {
    id: str(o.id, 'The playbook id'),
    name: str(o.name, 'The playbook name'),
    rules: settings<RulesProfile>(o.rules, DEFAULT_RULES, NULLABLE_RULES),
    plays,
    wristCoach,
    schemaVersion: 1,
  }
}

/** The text of an export file. */
export function exportPlaybook(playbook: Playbook, now: Date = new Date()): string {
  const file: PlaybookFile = { app: 'seven-deep', schemaVersion: 1, exportedAt: now.toISOString(), playbook }
  return JSON.stringify(file, null, 2)
}

/** Reads an export file's text. Also accepts a bare playbook object. Throws PlaybookFormatError. */
export function importPlaybook(text: string): Playbook {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('This file is not valid JSON. Pick a playbook file exported from this app.')
  }
  const o = obj(data, 'The file')
  return parsePlaybook('playbook' in o ? o.playbook : o)
}

/** A safe file name for the export, such as "my-playbook-2026-11-25.json". */
export function exportFileName(playbookName: string, now: Date = new Date()): string {
  const slug = playbookName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'playbook'
  return `${slug}-${now.toISOString().slice(0, 10)}.json`
}
