import { describe, expect, it } from 'vitest'
import { getFormation } from '../formations/formations'
import { DEFAULT_RULES } from '../model/defaults'
import { createPlay, createPlayers, playerId } from '../model/players'
import type { Assignment, Play } from '../model/types'
import { absolutePath, getAssignment } from '../routes/assignments'
import { buildRoute } from '../routes/routeTree'
import {
  duplicateNumbers,
  duplicatePlay,
  mirrorPlay,
  newPlay,
  nextPlayNumber,
  normalizeTag,
  searchPlays,
  sortPlays,
  stepPlay,
  swipeStep,
  tagCounts,
} from './library'

const rules = DEFAULT_RULES

function make(more: Partial<Play> = {}, formation = 'spread'): Play {
  const f = getFormation(formation)!
  return { ...createPlay(f.name, createPlayers(f.spots)), ...more }
}

const withRoute = (play: Play, label: string, routeName: string, more: Partial<Assignment> = {}): Play => {
  const player = play.players.find((p) => p.label === label)!
  const path = buildRoute(routeName as 'go', player.start)
  return { ...play, assignments: [...play.assignments, { playerId: player.id, kind: 'route', routeName, path, ...more }] }
}

const drawn = (play: Play, label: string, slot: 'main' | 'motion' = 'main') => {
  const player = play.players.find((p) => p.label === label)!
  return absolutePath(play, player, getAssignment(play, player.id, slot)!)
}

const book = [
  make({ number: 3, name: 'Mesh Flood', formation: 'Trips Right', tags: ['pass', 'red zone'] }),
  make({ number: 1, name: 'Four Verts', tags: ['pass'] }),
  make({ number: 2, name: 'Sweep Right', formation: 'Trips Right', tags: ['run'] }),
]

describe('numbering and order', () => {
  it('lists plays in call-number order', () => {
    expect(sortPlays(book).map((p) => p.number)).toEqual([1, 2, 3])
  })

  it('gives a new play the next number after the highest in use', () => {
    expect(nextPlayNumber(book)).toBe(4)
    expect(nextPlayNumber([])).toBe(1)
    expect(newPlay(book)).toMatchObject({ number: 4, name: 'New play', formation: 'Spread' })
  })

  it('finds call numbers used twice', () => {
    expect(duplicateNumbers(book).size).toBe(0)
    expect([...duplicateNumbers([...book, make({ number: 2 })])]).toEqual([2])
  })
})

describe('duplicatePlay', () => {
  it('makes an independent copy with a new id and the next number', () => {
    const source = withRoute(book[0], 'Y', 'out')
    const copy = duplicatePlay(source, book)
    expect(copy.id).not.toBe(source.id)
    expect(copy.number).toBe(4)
    expect(copy.name).toBe('Mesh Flood copy')
    expect(copy.players).toEqual(source.players)
    expect(copy.assignments).toEqual(source.assignments)
    // Nothing is shared, so editing one cannot change the other.
    expect(copy.players[0]).not.toBe(source.players[0])
    expect(copy.assignments[0].path).not.toBe(source.assignments[0].path)
    expect(copy.tags).not.toBe(source.tags)
  })
})

describe('mirrorPlay', () => {
  it('makes a new play that remembers where it came from', () => {
    const mirrored = mirrorPlay(book[0], book, rules)
    expect(mirrored.id).not.toBe(book[0].id)
    expect(mirrored.mirroredFrom).toBe(book[0].id)
    expect(mirrored.number).toBe(4)
    expect(mirrored.name).toBe('Mesh Flood (mirror)')
    expect(mirrored.formation).toBe('Trips Left')
  })

  it('flips x on every player and leaves the original alone', () => {
    const source = make({}, 'trips')
    const before = structuredClone(source)
    const mirrored = mirrorPlay(source, [source], rules)
    for (const player of source.players) {
      const other = mirrored.players.find((p) => p.id === player.id)!
      expect(other.start).toEqual({ x: -player.start.x + 0, y: player.start.y })
    }
    expect(source).toEqual(before)
  })

  it('flips every route with its player', () => {
    const source = withRoute(withRoute(make(), 'Y', 'out'), 'Z', 'post')
    const mirrored = mirrorPlay(source, [source], rules)
    for (const label of ['Y', 'Z']) {
      expect(drawn(mirrored, label)).toEqual(drawn(source, label).map((p) => ({ x: -p.x + 0, y: p.y })))
    }
    // An out is still an out: Y now breaks toward the right sideline.
    expect(drawn(mirrored, 'Y').at(-1)!.x).toBe(13)
  })

  it('flips the route of a player on the ball, who has no sideline to follow', () => {
    const source = withRoute(make(), 'C', 'out')
    expect(drawn(source, 'C').at(-1)).toEqual({ x: 5, y: 5 })
    const mirrored = mirrorPlay(source, [source], rules)
    expect(drawn(mirrored, 'C').at(-1)).toEqual({ x: -5, y: 5 })
  })

  it('flips freehand routes and motion', () => {
    const y = playerId('Y')
    const source: Play = {
      ...make(),
      assignments: [
        { playerId: y, kind: 'motion', routeName: 'custom', path: [{ x: 3, y: -1 }] },
        { playerId: y, kind: 'route', routeName: 'custom', path: [{ x: 0, y: 6 }, { x: 4, y: 9 }] },
      ],
    }
    const mirrored = mirrorPlay(source, [source], rules)
    expect(drawn(mirrored, 'Y', 'motion')).toEqual([{ x: 8, y: -1 }, { x: 5, y: -2 }])
    expect(drawn(mirrored, 'Y')).toEqual([{ x: 5, y: -2 }, { x: 5, y: 4 }, { x: 1, y: 7 }])
  })

  it('keeps handoffs, delays, and read order', () => {
    const qb = playerId('QB')
    const rb = playerId('RB')
    const source: Play = {
      ...withRoute(make(), 'Y', 'in', { readOrder: 1, delayCounts: 1 }),
    }
    source.assignments.push(
      { playerId: rb, kind: 'run', routeName: 'sweep', routeDepth: 5, path: buildRoute('sweep', { x: 3, y: -5 }) },
      { playerId: qb, kind: 'handoff', path: [], handoffTo: rb },
    )
    const mirrored = mirrorPlay(source, [source], rules)
    expect(getAssignment(mirrored, playerId('Y'))).toMatchObject({ readOrder: 1, delayCounts: 1 })
    expect(getAssignment(mirrored, qb)).toMatchObject({ kind: 'handoff', handoffTo: rb })
    // The sweep now goes left.
    expect(drawn(mirrored, 'RB').at(-1)!.x).toBe(-13)
  })

  it('mirrored twice is the original play again', () => {
    let source = withRoute(withRoute(withRoute(make({}, 'bunch'), 'Y', 'corner'), 'C', 'hitch'), 'X', 'slant')
    source = { ...source, assignments: [...source.assignments, { playerId: playerId('QB'), kind: 'qbRunIfBlitzed', routeName: 'roll', routeDepth: 2, path: buildRoute('roll', { x: 0, y: -5 }) }] }
    const twice = mirrorPlay(mirrorPlay(source, [source], rules), [source], rules)
    expect(twice.players).toEqual(source.players)
    expect(twice.formation).toBe(source.formation)
    for (const a of source.assignments) {
      const player = source.players.find((p) => p.id === a.playerId)!
      const back = twice.assignments.find((b) => b.playerId === a.playerId && b.kind === a.kind)!
      expect(absolutePath(twice, player, back)).toEqual(absolutePath(source, player, a))
    }
  })
})

describe('tags and search', () => {
  it('cleans up a typed tag', () => {
    expect(normalizeTag('  Red   Zone ')).toBe('red zone')
  })

  it('counts plays per tag, alphabetically', () => {
    expect(tagCounts(book)).toEqual([
      { tag: 'pass', count: 2 },
      { tag: 'red zone', count: 1 },
      { tag: 'run', count: 1 },
    ])
  })

  it('returns everything in number order for an empty search', () => {
    expect(searchPlays(book, '').map((p) => p.name)).toEqual(['Four Verts', 'Sweep Right', 'Mesh Flood'])
  })

  it('searches by name, formation, tag, and number, ignoring case', () => {
    expect(searchPlays(book, 'MESH').map((p) => p.name)).toEqual(['Mesh Flood'])
    expect(searchPlays(book, 'trips').map((p) => p.number)).toEqual([2, 3])
    expect(searchPlays(book, 'red zone').map((p) => p.name)).toEqual(['Mesh Flood'])
    expect(searchPlays(book, '2').map((p) => p.name)).toEqual(['Sweep Right'])
    expect(searchPlays(book, 'nothing')).toEqual([])
  })

  it('needs every word to match', () => {
    expect(searchPlays(book, 'trips run').map((p) => p.name)).toEqual(['Sweep Right'])
  })

  it('filters by tag, alone or with a search', () => {
    expect(searchPlays(book, '', 'pass').map((p) => p.number)).toEqual([1, 3])
    expect(searchPlays(book, 'verts', 'pass').map((p) => p.number)).toEqual([1])
    expect(searchPlays(book, 'verts', 'run')).toEqual([])
  })
})

describe('flipping through plays', () => {
  const byNumber = (n: number) => book.find((p) => p.number === n)!

  it('steps forward and back in call-number order', () => {
    expect(stepPlay(book, byNumber(1).id, 1)).toBe(byNumber(2))
    expect(stepPlay(book, byNumber(2).id, 1)).toBe(byNumber(3))
    expect(stepPlay(book, byNumber(2).id, -1)).toBe(byNumber(1))
  })

  it('stops at the first and last play', () => {
    expect(stepPlay(book, byNumber(1).id, -1)).toBe(byNumber(1))
    expect(stepPlay(book, byNumber(3).id, 1)).toBe(byNumber(3))
  })

  it('starts from the first play when the current one is not in the list', () => {
    const passes = book.filter((p) => p.tags.includes('pass'))
    expect(stepPlay(passes, byNumber(2).id, 1)).toBe(byNumber(1))
    expect(stepPlay([], byNumber(2).id, 1)).toBeUndefined()
  })

  it('reads a swipe left as next and a swipe right as previous', () => {
    expect(swipeStep(-120, 10)).toBe(1)
    expect(swipeStep(120, -10)).toBe(-1)
  })

  it('ignores short drags and mostly vertical ones', () => {
    expect(swipeStep(-30, 0)).toBe(0)
    expect(swipeStep(-80, 90)).toBe(0)
    expect(swipeStep(0, 200)).toBe(0)
  })
})
