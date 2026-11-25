import { flipFormationName, FORMATIONS, mirrorPlayers } from '../formations/formations'
import { createPlay, createPlayers } from '../model/players'
import type { Play, RulesProfile } from '../model/types'
import { refitRoutes, snapSpot } from '../routes/assignments'
import { isTreeRoute } from '../routes/routeTree'

export const MAX_PLAY_NUMBER = 999

/** Tags offered as one-tap chips. Any other tag can be typed in. */
export const COMMON_TAGS = ['pass', 'run', 'red zone']

export const normalizeTag = (tag: string) => tag.trim().toLowerCase().replace(/\s+/g, ' ')

/** Plays in call-number order, the order of the wrist coach. Ties keep their saved order. */
export const sortPlays = (plays: Play[]): Play[] => [...plays].sort((a, b) => a.number - b.number)

/** The next free call number: one past the highest in use. */
export const nextPlayNumber = (plays: Play[]): number =>
  Math.min(MAX_PLAY_NUMBER, plays.reduce((max, p) => Math.max(max, p.number), 0) + 1)

/** A blank play in the first formation, with the next call number. */
export function newPlay(plays: Play[]): Play {
  const formation = FORMATIONS[0]
  return { ...createPlay(formation.name, createPlayers(formation.spots)), number: nextPlayNumber(plays) }
}

/** An independent copy with its own id and the next call number. */
export function duplicatePlay(play: Play, plays: Play[]): Play {
  const { mirroredFrom: _dropped, ...rest } = structuredClone(play)
  return { ...rest, id: crypto.randomUUID(), number: nextPlayNumber(plays), name: `${play.name} copy` }
}

/**
 * The same play run to the other side, as a new play.
 * Every player crosses the ball, and every path flips with them.
 */
export function mirrorPlay(play: Play, plays: Play[], rules: RulesProfile): Play {
  const copy = structuredClone(play)

  // A template path breaks toward its player's sideline, so it flips by itself once the
  // player crosses the ball. A player on the ball has no sideline to follow, so flip theirs by hand.
  const assignments = copy.assignments.map((a) => {
    const player = copy.players.find((p) => p.id === a.playerId)
    if (!player || a.kind === 'motion' || !isTreeRoute(a.routeName)) return a
    if (snapSpot(copy, player).x !== 0) return a
    const { routeFlipped, ...rest } = a
    return routeFlipped ? rest : { ...rest, routeFlipped: true }
  })

  const mirrored: Play = {
    ...copy,
    id: crypto.randomUUID(),
    number: nextPlayNumber(plays),
    name: `${play.name} (mirror)`,
    formation: flipFormationName(play.formation),
    players: mirrorPlayers(copy.players),
    assignments,
    mirroredFrom: play.id,
  }
  // Freehand paths and motion flip here. Template paths are rebuilt from their new side.
  return refitRoutes(mirrored, rules, new Set(mirrored.players.map((p) => p.id)))
}

/** Every tag in use, in alphabetical order, with how many plays carry it. */
export function tagCounts(plays: Play[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const play of plays) for (const tag of play.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
}

/**
 * Plays matching a search and an optional tag, in call-number order.
 * The search looks at the name, formation, tags, and call number. Every word must match something.
 */
export function searchPlays(plays: Play[], query: string, tag: string | null = null): Play[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return sortPlays(plays).filter((play) => {
    if (tag && !play.tags.includes(tag)) return false
    const haystack = [play.name, play.formation, String(play.number), ...play.tags].join(' ').toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** Call numbers used by more than one play. Two plays cannot share a spot on the wrist coach. */
export function duplicateNumbers(plays: Play[]): Set<number> {
  const seen = new Set<number>()
  const dupes = new Set<number>()
  for (const { number } of plays) (seen.has(number) ? dupes : seen).add(number)
  return dupes
}

/**
 * The play to show after stepping forward (+1) or back (-1) through a list in call-number
 * order. Stops at either end. When the current play is not in the list, such as after a
 * tag filter hides it, starts from the first.
 */
export function stepPlay(plays: Play[], currentId: string, step: 1 | -1): Play | undefined {
  const ordered = sortPlays(plays)
  const index = ordered.findIndex((p) => p.id === currentId)
  if (index < 0) return ordered[0]
  return ordered[Math.min(ordered.length - 1, Math.max(0, index + step))]
}

/**
 * Reads a finger swipe: +1 for a swipe left (next play), -1 for a swipe right (previous),
 * 0 for anything too short or more up-and-down than sideways.
 */
export function swipeStep(dx: number, dy: number, threshold = 48): 1 | -1 | 0 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return 0
  return dx < 0 ? 1 : -1
}
