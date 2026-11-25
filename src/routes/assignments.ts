import { nearestPointOnPath } from '../geometry/path'
import { fieldBounds, lineupBounds, mirrorPoint } from '../geometry/snap'
import type { Assignment, AssignmentKind, Play, Player, Point, RulesProfile } from '../model/types'
import { buildRoute, clampPath, isTreeRoute } from './routeTree'

/**
 * A player has one assignment per slot: a motion before the snap, a main job,
 * and (for the QB) a run if blitzed. Setting an assignment replaces the one in its slot.
 */
export type Slot = 'main' | 'motion' | 'blitz'

export const slotOf = (kind: AssignmentKind): Slot =>
  kind === 'motion' ? 'motion' : kind === 'qbRunIfBlitzed' ? 'blitz' : 'main'

export const getAssignment = (play: Play, playerId: string, slot: Slot = 'main'): Assignment | undefined =>
  play.assignments.find((a) => a.playerId === playerId && slotOf(a.kind) === slot)

const sameSlot = (a: Assignment, playerId: string, slot: Slot) => a.playerId === playerId && slotOf(a.kind) === slot

/** Adds the assignment, replacing whatever the player had in the same slot. */
export const withAssignment = (play: Play, assignment: Assignment): Play => ({
  ...play,
  assignments: [
    ...play.assignments.filter((a) => !sameSlot(a, assignment.playerId, slotOf(assignment.kind))),
    assignment,
  ],
})

export const withoutAssignment = (play: Play, playerId: string, slot: Slot = 'main'): Play => ({
  ...play,
  assignments: play.assignments.filter((a) => !sameSlot(a, playerId, slot)),
})

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })

/** Where a player is when the ball is snapped: their start, or the end of their motion. */
export function snapSpot(play: Play, player: Player): Point {
  const motion = getAssignment(play, player.id, 'motion')
  const last = motion?.path[motion.path.length - 1]
  return last ? add(player.start, last) : player.start
}

/** Where an assignment's offsets are measured from. */
export const pathOrigin = (play: Play, player: Player, assignment: Assignment): Point =>
  assignment.kind === 'motion' ? player.start : snapSpot(play, player)

/** A path as field positions, starting where the player starts it: what gets drawn. */
export function absolutePath(play: Play, player: Player, assignment: Assignment): Point[] {
  const origin = pathOrigin(play, player, assignment)
  return [origin, ...assignment.path.map((p) => add(origin, p))]
}

/**
 * Where a handoff happens: the spot on the ball carrier's run nearest the player handing off,
 * or the carrier's own spot when they have no run path.
 */
export function handoffPoint(play: Play, giver: Player, assignment: Assignment): Point | null {
  const carrier = play.players.find((p) => p.id === assignment.handoffTo)
  if (!carrier) return null
  const run = getAssignment(play, carrier.id)
  const path = run?.kind === 'run' ? absolutePath(play, carrier, run) : [snapSpot(play, carrier)]
  return nearestPointOnPath(path, snapSpot(play, giver))
}

/**
 * Refits every path after players or the ball have moved.
 *
 * A path from a template is rebuilt, so it still reaches the same depth past the line of
 * scrimmage and still breaks toward the correct sideline.
 * A freehand path keeps its shape and travels with the player. If the player was flipped
 * to the other side of the ball, pass their id in `mirrored` and the shape flips too.
 * Motion stays behind the line of scrimmage. Everything else stays inside the field.
 */
export function refitRoutes(play: Play, rules: RulesProfile, mirrored: ReadonlySet<string> = new Set()): Play {
  const field = fieldBounds(play.ballOn, rules)
  const lineup = lineupBounds(play.ballOn, rules)
  const playerOf = (a: Assignment) => play.players.find((p) => p.id === a.playerId)
  const flip = (a: Assignment) => (mirrored.has(a.playerId) ? a.path.map(mirrorPoint) : a.path)

  // Motion first, because it decides where every other path starts.
  const withMotion: Play = {
    ...play,
    assignments: play.assignments.map((a) => {
      const player = playerOf(a)
      if (!player || a.kind !== 'motion') return a
      return { ...a, path: clampPath(flip(a), player.start, lineup) }
    }),
  }

  return {
    ...withMotion,
    assignments: withMotion.assignments.map((a) => {
      const player = playerOf(a)
      if (!player || a.kind === 'motion' || a.path.length === 0) return a
      const origin = snapSpot(withMotion, player)
      if (isTreeRoute(a.routeName)) {
        return {
          ...a,
          path: buildRoute(a.routeName, origin, { depth: a.routeDepth, flipped: a.routeFlipped, bounds: field }),
        }
      }
      return { ...a, path: clampPath(flip(a), origin, field) }
    }),
  }
}
