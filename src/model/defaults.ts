import type { RulesProfile, WristCoachLayout, Yd } from './types'

/** Snap grid for players and waypoints. */
export const GRID: Yd = 1

export const DEFAULT_BALL_ON: Yd = 12

const FEET_PER_YARD = 3

/**
 * The league rulebook gives some distances in feet. The app works in yards only,
 * so they are converted once, here.
 */
export const feet = (ft: number): Yd => ft / FEET_PER_YARD

/**
 * Defaults follow the SportsLink coed 7v7 rules (last updated 1/1/2026).
 * The rulebook field is 200 ft long with 25 ft end zones, so 50 yd goal line to goal line.
 * It gives no width, which varies by park, so 40 yd is assumed.
 * Every value is a setting, because leagues differ.
 */
export const DEFAULT_RULES: RulesProfile = {
  name: 'SportsLink Coed 7v7',
  fieldWidth: 40,
  fieldLength: feet(200),
  endZoneDepth: feet(25),
  // Rulebook: "within 10 feet of the end zone".
  noRunZone: feet(10),
  firstDownAtMidfield: true,
  blitzAllowed: true,
  blitzesPerGame: 5,
  qbRunOnBlitz: true,
  qbRunAfterSeconds: 5,
  handoffsAllowed: true,
  blockingAllowed: false,
  allEligible: true,
  maxMales: 4,
  femalePlayEvery: 3,
}

/** Goal line to goal line. */
// Rounded so that thirds of a yard do not leave 49.999999 behind.
export const playingLength = (rules: RulesProfile): Yd =>
  Math.round((rules.fieldLength - 2 * rules.endZoneDepth) * 1e6) / 1e6

/** Fixed ball spots from the rulebook, as yards from the goal line being attacked. */
export function ballSpots(rules: RulesProfile): { label: string; ballOn: Yd }[] {
  return [
    // Possessions start on the offense's own 10-foot line.
    { label: 'Drive start', ballOn: playingLength(rules) - feet(10) },
    { label: 'Midfield', ballOn: playingLength(rules) / 2 },
    { label: '2-pt try', ballOn: feet(20) },
    { label: '1-pt try', ballOn: feet(10) },
  ]
}

export const DEFAULT_WRIST_COACH: WristCoachLayout = {
  windowWidthIn: 4.5,
  windowHeightIn: 2.25,
  windows: 3,
  playsPerWindow: 8,
  mode: 'qb',
  color: true,
}
