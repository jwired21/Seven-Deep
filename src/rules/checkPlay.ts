import { formatYd } from '../model/format'
import type { Play, Player, RulesProfile } from '../model/types'
import { getAssignment } from '../routes/assignments'

/** Something about a play that breaks the league's rules. A warning never blocks an edit. */
export type RuleWarning = {
  /** Stable per kind of problem, for list keys and tests. */
  id: string
  message: string
}

const EPS = 1e-6

/** True when the ball is spotted inside the no-run zone. */
export const inNoRunZone = (play: Play, rules: RulesProfile) =>
  rules.noRunZone > 0 && play.ballOn <= rules.noRunZone + EPS

/** A run play is one where somebody carries the ball: any run path or handoff. */
export const isRunPlay = (play: Play) => play.assignments.some((a) => a.kind === 'run' || a.kind === 'handoff')

const labelOf = (play: Play, id: string | undefined) => play.players.find((p) => p.id === id)?.label ?? '?'

/** Every way the play breaks the rules profile. Empty means no conflicts. */
export function checkPlay(play: Play, rules: RulesProfile): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const warn = (id: string, message: string) => warnings.push({ id, message })
  const handoffs = play.assignments.filter((a) => a.kind === 'handoff')

  if (isRunPlay(play) && inNoRunZone(play, rules)) {
    warn(
      'no-run-zone',
      `Run play inside the no-run zone. With the ball on the ${formatYd(play.ballOn)}, it must be passed across the line of scrimmage.`,
    )
  }

  if (handoffs.length > 0 && !rules.handoffsAllowed) {
    warn('handoff', 'This play has a handoff, and the rules profile does not allow handoffs.')
  }

  if (play.assignments.some((a) => a.kind === 'qbRunIfBlitzed')) {
    if (!rules.blitzAllowed) warn('blitz-run', 'This play has a QB run if blitzed, but the rules profile has no blitzing.')
    else if (!rules.qbRunOnBlitz) warn('blitz-run', 'This play has a QB run if blitzed, and the rules profile does not let the QB run on a blitz.')
  }

  if (!rules.blockingAllowed) {
    const blockers = play.assignments.filter((a) => a.kind === 'block').map((a) => labelOf(play, a.playerId))
    if (blockers.length > 0) warn('block', `${blockers.join(', ')} ${blockers.length > 1 ? 'are' : 'is'} set to block, and blocking is not allowed.`)
  }

  for (const motion of play.assignments.filter((a) => a.kind === 'motion')) {
    const last = motion.path[motion.path.length - 1]
    const before = motion.path[motion.path.length - 2] ?? { x: 0, y: 0 }
    if (last && last.y > before.y) {
      warn(`motion-${motion.playerId}`, `${labelOf(play, motion.playerId)} is in motion toward the line of scrimmage at the snap.`)
    }
  }

  // The QB keeping the ball on a designed run, with nobody handing it to them.
  for (const qb of play.players.filter((p) => p.label === 'QB')) {
    const keeps = getAssignment(play, qb.id)?.kind === 'run' && !handoffs.some((h) => h.handoffTo === qb.id)
    if (!keeps) continue
    const blitz = rules.blitzAllowed && rules.qbRunOnBlitz
    if (rules.qbRunAfterSeconds === null && !blitz) warn('qb-run', 'The QB has a run, and the rules profile never lets the QB run.')
    else {
      const when = [blitz && 'when blitzed', rules.qbRunAfterSeconds !== null && `after the ${rules.qbRunAfterSeconds}-count`]
        .filter(Boolean)
        .join(' or ')
      warn('qb-run', `The QB has a designed run. The QB can only run ${when}.`)
    }
  }

  if (!rules.allEligible) {
    const center = play.players.find((p) => p.label === 'C')
    if (center && getAssignment(play, center.id)?.kind === 'route') {
      warn('center', 'The center has a route, and the rules profile does not make the center eligible.')
    }
  }

  if (rules.maxMales !== null) {
    const males = play.players.filter((p) => p.gender === 'M').length
    if (males > rules.maxMales) warn('males', `${males} males on the field. The limit is ${rules.maxMales}.`)
  }

  return warnings
}

export type FemalePlay = {
  /** 'unknown' when no player has a gender set, or the play does not say who gets the ball. */
  status: 'yes' | 'no' | 'unknown'
  reason: string
}

const isF = (p: Player | undefined) => p?.gender === 'F'

/**
 * Whether the play counts toward the coed rule that a female must be the operative player:
 * the thrower, the intended receiver, or the runner.
 */
export function femalePlay(play: Play): FemalePlay {
  if (!play.players.some((p) => p.gender)) return { status: 'unknown', reason: 'Set each player’s gender to check this.' }
  const byId = (id: string | undefined) => play.players.find((p) => p.id === id)
  const qb = play.players.find((p) => p.label === 'QB')

  const handoff = play.assignments.find((a) => a.kind === 'handoff')
  const runner = handoff ? byId(handoff.handoffTo) : byId(play.assignments.find((a) => a.kind === 'run')?.playerId)
  if (runner) {
    return isF(runner)
      ? { status: 'yes', reason: `${runner.label} carries the ball.` }
      : { status: 'no', reason: `${runner.label}, who carries the ball, is not female.` }
  }

  if (isF(qb)) return { status: 'yes', reason: 'The QB throws it.' }

  const first = byId(play.assignments.find((a) => a.kind === 'route' && a.readOrder === 1)?.playerId)
  if (first) {
    return isF(first)
      ? { status: 'yes', reason: `${first.label} is the first read.` }
      : { status: 'no', reason: `${first.label}, the first read, is not female.` }
  }
  return { status: 'unknown', reason: 'Mark a first read to check this.' }
}
