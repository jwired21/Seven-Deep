import { clampPoint, lineupBounds } from '../geometry/snap'
import { playingLength } from '../model/defaults'
import { formatYd } from '../model/format'
import type { Play, RulesProfile, Yd } from '../model/types'
import { refitRoutes } from '../routes/assignments'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Cleans up a typed yard distance. A value within a hundredth of a third of a yard becomes
 * that third exactly, so typing 3.33 or 66.67 gives the rulebook's 10 and 200 feet.
 */
export function tidyYd(value: number): Yd {
  const third = Math.round(value * 3) / 3
  return Math.abs(value - third) < 0.011 ? third : Math.round(value * 100) / 100
}

/** A count that can be switched off: a whole number of at least `min`, or null. */
const count = (value: number | null, min: number, max: number): number | null =>
  value === null || !Number.isFinite(value) ? null : clamp(Math.round(value), min, max)

/** Pulls every setting into a sane range, so no combination can break the field drawing. */
export function sanitizeRules(rules: RulesProfile): RulesProfile {
  const fieldWidth = clamp(tidyYd(rules.fieldWidth), 10, 60)
  const endZoneDepth = clamp(tidyYd(rules.endZoneDepth), 0, 15)
  // At least 10 yards of field between the goal lines.
  const fieldLength = clamp(tidyYd(rules.fieldLength), endZoneDepth * 2 + 10, 140)
  const playing = fieldLength - endZoneDepth * 2
  return {
    ...rules,
    name: rules.name.slice(0, 40),
    fieldWidth,
    fieldLength,
    endZoneDepth,
    noRunZone: clamp(tidyYd(rules.noRunZone), 0, playing / 2),
    blitzesPerGame: count(rules.blitzesPerGame, 0, 99),
    qbRunAfterSeconds: count(rules.qbRunAfterSeconds, 1, 30),
    maxMales: count(rules.maxMales, 0, 7),
    femalePlayEvery: count(rules.femalePlayEvery, 1, 10),
  }
}

/** True when the field itself changed size, so plays need refitting. */
export const fieldChanged = (a: RulesProfile, b: RulesProfile) =>
  a.fieldWidth !== b.fieldWidth || a.fieldLength !== b.fieldLength || a.endZoneDepth !== b.endZoneDepth

/** Keeps a play legal on a field of a new size: ball between the goal lines, players in bounds, paths refitted. */
export function fitPlayToRules(play: Play, rules: RulesProfile): Play {
  const ballOn = clamp(play.ballOn, Math.min(1, play.ballOn), playingLength(rules) - 1)
  const bounds = lineupBounds(ballOn, rules)
  const moved = {
    ...play,
    ballOn,
    players: play.players.map((p) => {
      const start = clampPoint(p.start, bounds)
      return start.x === p.start.x && start.y === p.start.y ? p : { ...p, start }
    }),
  }
  return refitRoutes(moved, rules)
}

/** The profile in a few short lines, shown beside the editor. */
export function rulesSummary(rules: RulesProfile): string[] {
  const qbRun = [
    rules.blitzAllowed && rules.qbRunOnBlitz && 'on a blitz',
    rules.qbRunAfterSeconds !== null && `after the ${rules.qbRunAfterSeconds}-count`,
  ].filter(Boolean)

  const blitz = !rules.blitzAllowed
    ? 'No blitzing'
    : rules.blitzesPerGame === null
      ? 'Blitz allowed'
      : `Blitz allowed, ${rules.blitzesPerGame} per game`

  return [
    `Field: ${formatYd(rules.fieldWidth)} × ${formatYd(rules.fieldLength)} yd, ${formatYd(rules.endZoneDepth)} yd end zones`,
    rules.firstDownAtMidfield && 'One first down, at midfield',
    blitz,
    qbRun.length ? `QB can run ${qbRun.join(' or ')}` : 'QB cannot run',
    rules.noRunZone > 0 ? `No-run zone: ${formatYd(rules.noRunZone)} yd from goal line` : 'No no-run zone',
    rules.handoffsAllowed ? 'Handoffs, pitches, and run plays legal' : 'No handoffs',
    rules.blockingAllowed ? 'Blocking allowed' : 'No blocking or picks',
    rules.allEligible ? 'All 7 players eligible' : 'Center not eligible',
    rules.maxMales !== null && `Coed: at most ${rules.maxMales} males on the field`,
    rules.femalePlayEvery !== null && `Coed: a female play 1 of every ${rules.femalePlayEvery}`,
  ].filter((line): line is string => Boolean(line))
}
