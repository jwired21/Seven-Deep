import { clampPoint, mirrorPoint, type Bounds } from '../geometry/snap'
import type { Player, Point, Position } from '../model/types'

type Spots = Record<Exclude<Position, 'H'>, Point>

export type Formation = {
  id: string
  name: string
  /** Start points in yards from the ball. Linemen and receivers sit one yard behind the line. */
  spots: Spots
}

// Shared by every template: center over the ball, QB in a short shotgun, back offset to the right.
const core = {
  C: { x: 0, y: -1 },
  QB: { x: 0, y: -5 },
  RB: { x: 3, y: -5 },
}

export const FORMATIONS: Formation[] = [
  {
    id: 'spread',
    name: 'Spread',
    // Four receivers spaced evenly across the field.
    spots: { ...core, X: { x: -16, y: -1 }, Y: { x: -8, y: -1 }, Z: { x: 8, y: -1 }, W: { x: 16, y: -1 } },
  },
  {
    id: 'doubles',
    name: 'Doubles',
    // Two by two: a wide receiver on the line and a slot off it, each side.
    spots: { ...core, X: { x: -16, y: -1 }, Y: { x: -11, y: -2 }, Z: { x: 11, y: -2 }, W: { x: 16, y: -1 } },
  },
  {
    id: 'trips',
    name: 'Trips Right',
    // Three receivers to one side, one alone on the other.
    spots: { ...core, X: { x: -16, y: -1 }, Y: { x: 7, y: -1 }, Z: { x: 12, y: -2 }, W: { x: 17, y: -1 } },
  },
  {
    id: 'bunch',
    name: 'Bunch Right',
    // Three receivers in a tight triangle, point man on the line.
    spots: { ...core, X: { x: -16, y: -1 }, Y: { x: 8, y: -2 }, Z: { x: 10, y: -1 }, W: { x: 12, y: -2 } },
  },
  {
    id: 'stack',
    name: 'Stack',
    // Two receivers stacked one behind the other, each side.
    spots: { ...core, X: { x: -12, y: -1 }, Y: { x: -12, y: -3 }, Z: { x: 12, y: -1 }, W: { x: 12, y: -3 } },
  },
  {
    id: 'tight',
    name: 'Tight',
    // All four receivers in next to the center, on the line, two yards apart.
    spots: { ...core, X: { x: -4, y: -1 }, Y: { x: -2, y: -1 }, Z: { x: 2, y: -1 }, W: { x: 4, y: -1 } },
  },
  {
    id: 'empty',
    name: 'Empty Left',
    // Spread with no one in the backfield: the back moves up between the center and Y.
    // Flipped, the back sits between the center and Z.
    spots: {
      ...core,
      RB: { x: -4, y: -1 },
      X: { x: -16, y: -1 },
      Y: { x: -8, y: -1 },
      Z: { x: 8, y: -1 },
      W: { x: 16, y: -1 },
    },
  },
]

export const getFormation = (id: string): Formation | undefined => FORMATIONS.find((f) => f.id === id)

/**
 * Moves each player to their spot in the formation, matched by label.
 * Players keep their id, label, and color. A player whose label is not in the
 * template stays put. Spots are pulled inside `bounds` for narrow fields.
 */
export function applyFormation(players: Player[], formation: Formation, bounds?: Bounds): Player[] {
  const spots: Record<string, Point> = formation.spots
  return players.map((player) => {
    const spot = spots[player.label]
    if (!spot) return player
    return { ...player, start: bounds ? clampPoint(spot, bounds) : { ...spot } }
  })
}

/** A true mirror: every player crosses to the other side of the ball. Used when mirroring a whole play. */
export const mirrorPlayers = (players: Player[]): Player[] =>
  players.map((player) => ({ ...player, start: mirrorPoint(player.start) }))

/**
 * Flips a formation's strength to the other side.
 *
 * A player whose mirror spot is already taken by a teammate stays put, because moving
 * both would only trade their labels. So in Empty the receivers hold and only the back
 * crosses over, from between C and Y to between C and Z. In Trips, where nothing is
 * symmetric, everyone crosses.
 */
export function flipPlayers(players: Player[]): Player[] {
  const key = (p: Point) => `${p.x},${p.y}`
  const taken = new Set(players.map((p) => key(p.start)))
  return players.map((player) => {
    const mirrored = mirrorPoint(player.start)
    if (taken.has(key(mirrored))) return player
    return { ...player, start: mirrored }
  })
}

/** "Trips Right" becomes "Trips Left" and back. Names without a side are unchanged. */
export const flipFormationName = (name: string): string =>
  name.replace(/\b(Right|Left)\b/, (side) => (side === 'Right' ? 'Left' : 'Right'))
