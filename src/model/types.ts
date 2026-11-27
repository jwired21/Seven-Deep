/**
 * The data model, straight from BRIEF.md.
 *
 * Everything here is in yards, never pixels. The origin is the ball.
 * `x` runs across the field (negative is left).
 * `y` runs downfield (positive is toward the goal line).
 */

export type Yd = number

export type Point = { x: Yd; y: Yd }

export type Position = 'QB' | 'C' | 'RB' | 'X' | 'Y' | 'Z' | 'W' | 'H'

export type Player = {
  id: string
  /** Editable, 1 to 2 characters. */
  label: Position | string
  /** Screen color. The print color is derived from it. */
  color: string
  start: Point
  /** For coed leagues: the male limit and the female-play rule. */
  gender?: 'M' | 'F'
}

export type AssignmentKind =
  | 'route'
  | 'run'
  | 'handoff'
  | 'motion'
  | 'qbRunIfBlitzed'
  | 'block'
  | 'none'

/**
 * What one player does. A player has at most one assignment per slot:
 * a motion before the snap, a main job (route, run, handoff, or block),
 * and for the QB a run if blitzed.
 */
export type Assignment = {
  playerId: string
  kind: AssignmentKind
  /**
   * Waypoints as offsets, in yards, from where the player is at the snap: their start, or
   * the end of their motion. A motion's own path is offsets from the start.
   * Offsets, not field positions, so a path travels with its player.
   * A handoff has no path: it points at the ball carrier with `handoffTo`.
   */
  path: Point[]
  /** A template id such as 'slant', 'out', 'sweep', or 'roll', or 'custom' for freehand. */
  routeName?: string
  /** For a route from the tree: depth of the break, in yards past the line of scrimmage. */
  routeDepth?: Yd
  /** For a route from the tree: break the opposite way from the player's natural side. */
  routeFlipped?: boolean
  /** Delayed release, used by the center. */
  delayCounts?: number
  /** 1, 2, 3 for the QB's progression. */
  readOrder?: number
  /** playerId, for kind 'handoff'. */
  handoffTo?: string
}

export type Play = {
  id: string
  /** The call number on the wrist coach. */
  number: number
  name: string
  formation: string
  /** 'pass', 'run', 'red zone', ... */
  tags: string[]
  /** Yards from the goal line. */
  ballOn: Yd
  /** Always 7. */
  players: Player[]
  assignments: Assignment[]
  notes?: string
  /** Play id, when made by mirror. */
  mirroredFrom?: string
  /** Player id: who the ball is thrown to when the play is played back. Defaults to the first read. */
  passTo?: string
}

export type RulesProfile = {
  name: string
  fieldWidth: Yd
  /** Total length, both end zones included. */
  fieldLength: Yd
  endZoneDepth: Yd
  /** Yards from the goal line. 0 turns it off. */
  noRunZone: Yd
  /** One first down per field, at midfield. */
  firstDownAtMidfield: boolean
  blitzAllowed: boolean
  /** Null means no limit. */
  blitzesPerGame: number | null
  qbRunOnBlitz: boolean
  /** The rush count. Null means the QB can never run on a count. */
  qbRunAfterSeconds: number | null
  handoffsAllowed: boolean
  blockingAllowed: boolean
  allEligible: boolean
  /** Coed leagues: most males on the field at once. Null for no limit. */
  maxMales: number | null
  /** Coed leagues: one of every N plays must have a female as the operative player. Null for none. */
  femalePlayEvery: number | null
}

export type WristCoachLayout = {
  windowWidthIn: number
  windowHeightIn: number
  windows: number
  playsPerWindow: 4 | 6 | 8 | 12
  mode: 'qb' | 'player'
  /** For mode 'player'. */
  playerLabel?: string
  color: boolean
}

export type Playbook = {
  id: string
  name: string
  rules: RulesProfile
  plays: Play[]
  wristCoach: WristCoachLayout
  schemaVersion: 1
}
