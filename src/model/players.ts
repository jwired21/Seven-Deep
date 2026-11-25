import { DEFAULT_BALL_ON } from './defaults'
import type { Play, Player, Point, Position } from './types'

/** The seven positions on the field, in the order they are listed and tabbed through. */
export const LINEUP: Position[] = ['QB', 'C', 'RB', 'X', 'Y', 'Z', 'W']

export const POSITION_NAMES: Record<string, string> = {
  QB: 'Quarterback',
  C: 'Center',
  RB: 'Running back',
  X: 'Receiver',
  Y: 'Receiver',
  Z: 'Receiver',
  W: 'Receiver',
  H: 'Receiver',
}

/** One color per position, the same on screen, in the playbook, and on the wrist coach. */
export const POSITION_COLORS: Record<string, string> = {
  QB: '#FFFFFF',
  C: '#FF9CC8',
  RB: '#D5C8FF',
  X: '#B4F06A',
  Y: '#FFD23F',
  Z: '#7FDBFF',
  W: '#FFB37A',
  H: '#FFB37A',
}

export const playerId = (label: string) => `p-${label.toLowerCase()}`

/** Seven players at the given spots. `spots` must have an entry for every position in LINEUP. */
export function createPlayers(spots: Record<string, Point>): Player[] {
  return LINEUP.map((label) => ({
    id: playerId(label),
    label,
    color: POSITION_COLORS[label],
    start: { ...spots[label] },
  }))
}

/** Where a player is, in words: "8 yd right, 1 yd back". */
export function describeSpot(p: Point): string {
  const side = p.x === 0 ? 'On the ball' : `${Math.abs(p.x)} yd ${p.x < 0 ? 'left' : 'right'}`
  return `${side}, ${-p.y} yd back`
}

export function createPlay(formation: string, players: Player[]): Play {
  return {
    id: crypto.randomUUID(),
    number: 1,
    name: 'New play',
    formation,
    tags: [],
    ballOn: DEFAULT_BALL_ON,
    players,
    assignments: [],
  }
}
