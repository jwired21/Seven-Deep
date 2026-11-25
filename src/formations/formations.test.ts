import { describe, expect, it } from 'vitest'
import { lineupBounds } from '../geometry/snap'
import { DEFAULT_RULES } from '../model/defaults'
import { createPlayers, LINEUP } from '../model/players'
import { applyFormation, flipFormationName, flipPlayers, FORMATIONS, getFormation, mirrorPlayers } from './formations'

const bounds = lineupBounds(12, DEFAULT_RULES)

describe('formation templates', () => {
  it('has spread, doubles, trips, bunch, stack, tight, and empty', () => {
    expect(FORMATIONS.map((f) => f.id)).toEqual(['spread', 'doubles', 'trips', 'bunch', 'stack', 'tight', 'empty'])
  })

  for (const formation of FORMATIONS) {
    describe(formation.name, () => {
      const players = createPlayers(formation.spots)

      it('places all 7 players', () => {
        expect(players.map((p) => p.label)).toEqual(LINEUP)
      })

      it('keeps everyone on the 1-yard grid, in bounds, and behind the line of scrimmage', () => {
        for (const { start } of players) {
          expect(Number.isInteger(start.x) && Number.isInteger(start.y)).toBe(true)
          expect(start.x).toBeGreaterThanOrEqual(bounds.xMin)
          expect(start.x).toBeLessThanOrEqual(bounds.xMax)
          expect(start.y).toBeLessThanOrEqual(-1)
          expect(start.y).toBeGreaterThanOrEqual(bounds.yMin)
        }
      })

      it('never puts two players on the same spot', () => {
        const spots = new Set(players.map((p) => `${p.start.x},${p.start.y}`))
        expect(spots.size).toBe(7)
      })

      it('puts the center over the ball with the QB behind', () => {
        const at = (label: string) => players.find((p) => p.label === label)!.start
        expect(at('C')).toEqual({ x: 0, y: -1 })
        expect(at('QB').x).toBe(0)
        expect(at('QB').y).toBeLessThan(at('C').y)
      })
    })
  }

  it('puts three receivers on one side in trips and bunch', () => {
    for (const id of ['trips', 'bunch']) {
      const { spots } = getFormation(id)!
      const right = [spots.X, spots.Y, spots.Z, spots.W].filter((p) => p.x > 0)
      expect(right).toHaveLength(3)
    }
  })

  it('lines the four receivers up beside the center in tight, with the back where it always is', () => {
    const { spots } = getFormation('tight')!
    expect([spots.X, spots.Y, spots.C, spots.Z, spots.W]).toEqual([
      { x: -4, y: -1 },
      { x: -2, y: -1 },
      { x: 0, y: -1 },
      { x: 2, y: -1 },
      { x: 4, y: -1 },
    ])
    expect(spots.RB).toEqual(getFormation('spread')!.spots.RB)
  })

  it('moves the back up between the center and Y in empty, leaving the backfield to the QB', () => {
    const { spots } = getFormation('empty')!
    expect(spots.RB.y).toBe(spots.C.y)
    expect(spots.RB.x).toBeGreaterThan(spots.Y.x)
    expect(spots.RB.x).toBeLessThan(spots.C.x)
    const deep = Object.values(spots).filter((p) => p.y < -2)
    expect(deep).toEqual([spots.QB])
  })

  it('is balanced two by two in spread, doubles, stack, and tight', () => {
    for (const id of ['spread', 'doubles', 'stack', 'tight', 'empty']) {
      const { spots } = getFormation(id)!
      const xs = [spots.X, spots.Y, spots.Z, spots.W].map((p) => p.x)
      expect(xs.filter((x) => x < 0)).toHaveLength(2)
      expect(xs.reduce((a, b) => a + b, 0)).toBe(0)
    }
  })
})

describe('applyFormation', () => {
  it('moves players by label and keeps their id and color', () => {
    const before = createPlayers(getFormation('spread')!.spots)
    const after = applyFormation(before, getFormation('stack')!)
    const y = after.find((p) => p.label === 'Y')!
    expect(y.start).toEqual({ x: -12, y: -3 })
    expect(y.id).toBe(before.find((p) => p.label === 'Y')!.id)
    expect(y.color).toBe(before.find((p) => p.label === 'Y')!.color)
  })

  it('does not share point objects with the template', () => {
    const formation = getFormation('spread')!
    const players = applyFormation(createPlayers(formation.spots), formation)
    expect(players[0].start).not.toBe(formation.spots.QB)
  })

  it('pulls wide spots inside a narrow field', () => {
    const narrow = lineupBounds(12, { ...DEFAULT_RULES, fieldWidth: 30 })
    const players = applyFormation(createPlayers(getFormation('trips')!.spots), getFormation('trips')!, narrow)
    expect(Math.max(...players.map((p) => p.start.x))).toBe(15)
    expect(Math.min(...players.map((p) => p.start.x))).toBe(-15)
  })

  it('leaves a relabeled player where they are', () => {
    const players = createPlayers(getFormation('spread')!.spots).map((p) =>
      p.label === 'W' ? { ...p, label: 'TE' } : p,
    )
    const after = applyFormation(players, getFormation('stack')!)
    expect(after.find((p) => p.label === 'TE')!.start).toEqual({ x: 16, y: -1 })
  })
})

describe('flipping', () => {
  it('moves trips right to trips left', () => {
    const flipped = flipPlayers(createPlayers(getFormation('trips')!.spots))
    const at = (label: string) => flipped.find((p) => p.label === label)!.start
    expect(at('W')).toEqual({ x: -17, y: -1 })
    expect(at('X')).toEqual({ x: 16, y: -1 })
    expect(at('RB')).toEqual({ x: -3, y: -5 })
    expect(at('C')).toEqual({ x: 0, y: -1 })
  })

  it('flips empty by moving only the back, from between C and Y to between C and Z', () => {
    const before = createPlayers(getFormation('empty')!.spots)
    const flipped = flipPlayers(before)
    const at = (label: string) => flipped.find((p) => p.label === label)!.start
    expect(at('RB')).toEqual({ x: 4, y: -1 })
    expect(at('RB').x).toBeGreaterThan(at('C').x)
    expect(at('RB').x).toBeLessThan(at('Z').x)
    for (const label of ['X', 'Y', 'Z', 'W', 'C', 'QB']) {
      expect(at(label)).toEqual(before.find((p) => p.label === label)!.start)
    }
    // Flipping again puts the back where it started.
    expect(flipPlayers(flipped)).toEqual(before)
  })

  it('flips only the back in other balanced formations', () => {
    const flipped = flipPlayers(createPlayers(getFormation('spread')!.spots))
    const at = (label: string) => flipped.find((p) => p.label === label)!.start
    expect(at('RB')).toEqual({ x: -3, y: -5 })
    expect(at('X')).toEqual({ x: -16, y: -1 })
    expect(at('W')).toEqual({ x: 16, y: -1 })
  })

  it('still has a true mirror for whole plays, where every player crosses', () => {
    const mirrored = mirrorPlayers(createPlayers(getFormation('empty')!.spots))
    const at = (label: string) => mirrored.find((p) => p.label === label)!.start
    expect(at('Y')).toEqual({ x: 8, y: -1 })
    expect(at('Z')).toEqual({ x: -8, y: -1 })
    expect(at('RB')).toEqual({ x: 4, y: -1 })
  })

  it('renames the side and leaves sideless names alone', () => {
    expect(flipFormationName('Trips Right')).toBe('Trips Left')
    expect(flipFormationName('Bunch Left')).toBe('Bunch Right')
    expect(flipFormationName('Spread')).toBe('Spread')
  })
})
