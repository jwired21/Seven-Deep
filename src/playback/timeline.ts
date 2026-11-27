import { distanceAlongPath, pathLength, pointAt } from '../geometry/path'
import type { Assignment, Play, Player, Point } from '../model/types'
import { absolutePath, getAssignment, handoffPoint, snapSpot } from '../routes/assignments'

/** How fast things move, in yards per second. Chosen to look right, not to model any one athlete. */
export const SPEED = {
  /** A player running a route or carrying the ball. */
  run: 6,
  /** A player jogging in motion before the snap. */
  motion: 4,
  /** A thrown ball. */
  pass: 20,
  /** The snap from the center to the QB. */
  snap: 12,
}

/** One count of a delayed release, in seconds. */
export const COUNT_SECONDS = 1

/** Stillness before anything moves, so the formation can be read. */
const PRE_SNAP_PAUSE = 0.6
/** The shortest time the QB holds the ball before throwing. */
const MIN_HOLD = 0.5
/** A pitch to a runner: a short wait, then a short flight. */
const PITCH_WAIT = 0.25
const PITCH_FLIGHT = 0.3
/** How long playback lingers after the last thing happens. */
const AFTER = 0.8

export type PlaybackOptions = {
  /** Show what happens on a blitz: the QB takes their "run if blitzed" path and keeps the ball. */
  blitz?: boolean
}

export type BallState = {
  at: Point
  /** True while the ball is thrown or pitched. */
  inAir: boolean
  /** 0 on the ground or in hand, rising to 1 at the top of a throw's arc. For drawing size. */
  height: number
  /** Who has the ball, when somebody does. */
  holderId: string | null
}

export type Timeline = {
  /** Seconds. Negative is before the snap. The snap is at 0. */
  start: number
  end: number
  /** Who the ball is thrown or pitched to, if anyone. */
  targetId: string | null
  /** When the ball leaves the passer's hand and when it arrives, if it is thrown. */
  throwAt: number | null
  catchAt: number | null
  /** Where a player is at a moment, in yards. */
  positionOf(playerId: string, time: number): Point
  ball(time: number): BallState
}

/** One stretch of a player's movement along a path. */
type Leg = { path: Point[]; startAt: number; speed: number; endAt: number }

type BallLeg =
  | { kind: 'snap' | 'flight'; from: number; to: number; a: Point; b: Point }
  | { kind: 'carry'; from: number; to: number; playerId: string }

const leg = (path: Point[], startAt: number, speed: number): Leg => ({
  path,
  startAt,
  speed,
  endAt: startAt + pathLength(path) / speed,
})

const along = (l: Leg, time: number): Point => pointAt(l.path, Math.max(0, time - l.startAt) * l.speed)

const lerp = (a: Point, b: Point, f: number): Point => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })

const hasPath = (a: Assignment | undefined): a is Assignment => !!a && a.path.length > 0

/** The player who takes the snap: the QB, or failing that the first player. */
export const passerOf = (play: Play): Player | undefined => play.players.find((p) => p.label === 'QB') ?? play.players[0]

/** Who the ball goes to on a pass: the chosen receiver if they have a route, otherwise the first read. */
export function passTarget(play: Play): Player | null {
  const runsRoute = (id: string | undefined) => {
    const a = id ? getAssignment(play, id) : undefined
    return a?.kind === 'route' && a.path.length > 0
  }
  if (runsRoute(play.passTo)) return play.players.find((p) => p.id === play.passTo) ?? null
  const first = play.assignments
    .filter((a) => a.kind === 'route' && a.readOrder && a.path.length > 0)
    .sort((a, b) => a.readOrder! - b.readOrder!)[0]
  return play.players.find((p) => p.id === first?.playerId) ?? null
}

/**
 * Works out the whole play in time: where each player and the ball are at any moment.
 *
 * Before the snap, players in motion jog to their spots, timed to arrive at the snap.
 * At the snap the ball goes to the QB, and everyone runs their path after any delay counts.
 * Then the ball is handed off, pitched to a runner, or thrown to the target, arriving as the
 * receiver reaches the end of their route.
 */
export function buildTimeline(play: Play, options: PlaybackOptions = {}): Timeline {
  const passer = passerOf(play)
  const origin: Point = { x: 0, y: 0 }

  const motions = new Map<string, Leg>()
  const mains = new Map<string, Leg>()
  const spots = new Map<string, Point>()

  for (const player of play.players) {
    spots.set(player.id, snapSpot(play, player))
    const motion = getAssignment(play, player.id, 'motion')
    if (hasPath(motion)) {
      const path = absolutePath(play, player, motion)
      // Timed backward from the snap, so the player sets exactly as the ball is snapped.
      motions.set(player.id, leg(path, -pathLength(path) / SPEED.motion, SPEED.motion))
    }
    const main = getAssignment(play, player.id)
    if (hasPath(main) && (main.kind === 'route' || main.kind === 'run')) {
      mains.set(player.id, leg(absolutePath(play, player, main), (main.delayCounts ?? 0) * COUNT_SECONDS, SPEED.run))
    }
  }

  const passerSpot = passer ? spots.get(passer.id)! : origin
  const snapTime = Math.max(0.15, Math.hypot(passerSpot.x, passerSpot.y) / SPEED.snap)

  // On a blitz the QB leaves on their "run if blitzed" path as soon as they have the ball.
  const blitzRun = passer && options.blitz ? getAssignment(play, passer.id, 'blitz') : undefined
  const blitzing = hasPath(blitzRun)
  if (passer && blitzing) mains.set(passer.id, leg(absolutePath(play, passer, blitzRun), snapTime, SPEED.run))

  const positionOf = (playerId: string, time: number): Point => {
    const player = play.players.find((p) => p.id === playerId)
    if (!player) return origin
    if (time <= 0) {
      const motion = motions.get(playerId)
      return motion ? along(motion, time) : player.start
    }
    const main = mains.get(playerId)
    return main ? along(main, time) : spots.get(playerId)!
  }

  // The ball: snap, then carried, handed off, pitched, or thrown.
  const ballLegs: BallLeg[] = []
  let targetId: string | null = null
  let throwAt: number | null = null
  let catchAt: number | null = null
  let lastBallEvent = snapTime

  if (passer) {
    ballLegs.push({ kind: 'snap', from: 0, to: snapTime, a: origin, b: passerSpot })
    let holder = passer.id
    let since = snapTime
    const carryUntil = (time: number, next: string) => {
      ballLegs.push({ kind: 'carry', from: since, to: time, playerId: holder })
      holder = next
      since = time
      lastBallEvent = time
    }

    if (!blitzing) {
      // Follow the handoffs from whoever has the ball, one after another.
      const handoffs = play.assignments.filter((a) => a.kind === 'handoff')
      const used = new Set<Assignment>()
      for (;;) {
        const handoff = handoffs.find((a) => a.playerId === holder && !used.has(a))
        const giver = play.players.find((p) => p.id === holder)
        const carrierRun = handoff?.handoffTo ? mains.get(handoff.handoffTo) : undefined
        if (!handoff || !giver || !handoff.handoffTo) break
        used.add(handoff)
        const mesh = handoffPoint(play, giver, handoff)
        // The exchange happens when the carrier reaches the spot on their run nearest the giver.
        const reach = carrierRun && mesh ? carrierRun.startAt + distanceAlongPath(carrierRun.path, mesh) / carrierRun.speed : since
        carryUntil(Math.max(since + 0.2, reach), handoff.handoffTo)
      }

      const handedOff = used.size > 0
      const passerRuns = getAssignment(play, passer.id)?.kind === 'run'
      const runner = play.players.find((p) => p.id !== passer.id && getAssignment(play, p.id)?.kind === 'run' && mains.has(p.id))

      if (handedOff || passerRuns) {
        // The ball is already with its carrier.
      } else if (runner) {
        // A run with no handoff drawn: the QB pitches it.
        const release = since + PITCH_WAIT
        const arrive = release + PITCH_FLIGHT
        targetId = runner.id
        carryUntil(release, runner.id)
        ballLegs.push({ kind: 'flight', from: release, to: arrive, a: passerSpot, b: positionOf(runner.id, arrive) })
        since = arrive
        lastBallEvent = arrive
      } else {
        const target = passTarget(play)
        const route = target ? mains.get(target.id) : undefined
        if (target && route) {
          // Thrown to where the route ends, timed to get there as the receiver does.
          const spot = route.path[route.path.length - 1]
          const flight = Math.hypot(spot.x - passerSpot.x, spot.y - passerSpot.y) / SPEED.pass
          throwAt = Math.max(since + MIN_HOLD, route.endAt - flight)
          catchAt = throwAt + flight
          targetId = target.id
          carryUntil(throwAt, target.id)
          ballLegs.push({ kind: 'flight', from: throwAt, to: catchAt, a: passerSpot, b: spot })
          since = catchAt
          lastBallEvent = catchAt
        }
      }
    }
    ballLegs.push({ kind: 'carry', from: since, to: Infinity, playerId: holder })
  }

  const ball = (time: number): BallState => {
    if (time <= 0 || ballLegs.length === 0) return { at: origin, inAir: false, height: 0, holderId: null }
    const current = ballLegs.find((l) => time >= l.from && time < l.to) ?? ballLegs[ballLegs.length - 1]
    if (current.kind === 'carry') {
      return { at: positionOf(current.playerId, time), inAir: false, height: 0, holderId: current.playerId }
    }
    const f = Math.min(1, Math.max(0, (time - current.from) / (current.to - current.from)))
    const thrown = current.kind === 'flight'
    return { at: lerp(current.a, current.b, f), inAir: thrown, height: thrown ? Math.sin(Math.PI * f) : 0, holderId: null }
  }

  const lastMove = Math.max(0, ...[...mains.values()].map((l) => l.endAt))
  const firstMove = Math.min(0, ...[...motions.values()].map((l) => l.startAt))

  return {
    start: firstMove - PRE_SNAP_PAUSE,
    end: Math.max(lastMove, lastBallEvent) + AFTER,
    targetId,
    throwAt,
    catchAt,
    positionOf,
    ball,
  }
}

/**
 * Moves playback forward by a slice of real time. Stops at the end of the play.
 * `rate` is the speed: 1 is real time, 0.5 is half speed.
 */
export function advance(time: number, elapsed: number, rate: number, timeline: Pick<Timeline, 'start' | 'end'>) {
  const next = Math.min(timeline.end, Math.max(timeline.start, time + elapsed * rate))
  return { time: next, playing: next < timeline.end }
}

/** The moment in words: "Before the snap", "Snap", or "1.4 s after the snap". */
export function describeTime(time: number): string {
  if (time < -0.005) return 'Before the snap'
  if (time < 0.05) return 'Snap'
  return `${time.toFixed(1)} s`
}
