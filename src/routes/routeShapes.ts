import { arrowHead, lastSegment, pathLength, splitPath, type Vec } from '../geometry/path'
import type { Assignment, AssignmentKind, Play, Player, Point } from '../model/types'
import { absolutePath, handoffPoint, snapSpot } from './assignments'

/**
 * Turns yards into the units being drawn in: pixels on screen, points in a PDF.
 * A FieldTransform fits this, and so does anything else with the same two functions.
 */
export type ToUnits = {
  toPx(p: Point): Vec
  /** A length in yards, in drawing units. */
  len(yd: number): number
}

/** One route, run, motion, or QB run if blitzed, ready to draw. All positions are in drawing units. */
export type PathShape = {
  player: Player
  assignment: Assignment
  kind: AssignmentKind
  /** Every point of the path, starting where the player starts it. */
  points: Vec[]
  /** Line weight. The first read is heavier. Motion and the QB run are lighter. */
  width: number
  /** The dotted first stretch of a delayed release. Empty when there is no delay. */
  wait: Vec[]
  /** The rest of the line, stopping just inside the arrowhead. */
  run: Vec[]
  /** On and off lengths for the main line, or null for solid. */
  dash: [number, number] | null
  /** On and off lengths for the delayed stretch. */
  waitDash: [number, number]
  /** Arrowhead as [tip, corner, corner]. Motion has none. */
  head: [Vec, Vec, Vec] | null
  /** Where a player in motion sets, drawn as a ring. */
  setRing: { at: Vec; radius: number; width: number } | null
  /** "delay 2", placed beside the start. */
  delayLabel: { text: string; at: Vec } | null
  /** The read number, placed just past the arrow tip. Centered on `at`. */
  readLabel: { text: string; at: Vec } | null
  /** "run if blitzed", placed beside the end. */
  note: { text: string; at: Vec } | null
}

/** A handoff: a thin line from the player handing off to the exchange point on the carrier's path. */
export type HandoffShape = {
  player: Player
  from: Vec
  to: Vec
  width: number
  ring: { radius: number; width: number }
  /** "handoff", centered above the middle of the line. */
  label: { text: string; at: Vec }
}

export type RouteShapes = { paths: PathShape[]; handoffs: HandoffShape[] }

/**
 * The geometry of everything the players do on a play.
 * The screen and the PDF both draw from this, so they cannot drift apart.
 *
 * `stroke` is the weight of an ordinary route line and `labelSize` the text size, both in drawing units.
 */
export function routeShapes(play: Play, t: ToUnits, stroke: number, labelSize: number): RouteShapes {
  const paths: PathShape[] = []
  const handoffs: HandoffShape[] = []

  for (const assignment of play.assignments) {
    const player = play.players.find((p) => p.id === assignment.playerId)
    if (!player) continue

    if (assignment.kind === 'handoff') {
      const mesh = handoffPoint(play, player, assignment)
      if (!mesh) continue
      const from = t.toPx(snapSpot(play, player))
      const to = t.toPx(mesh)
      handoffs.push({
        player,
        from,
        to,
        width: stroke * 0.6,
        ring: { radius: stroke * 1.8, width: stroke * 0.7 },
        // Above the middle of the line, clear of both player markers.
        label: { text: 'handoff', at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - t.len(1.1) } },
      })
      continue
    }
    if (assignment.kind === 'block' || assignment.kind === 'none') continue

    const points = absolutePath(play, player, assignment).map(t.toPx)
    const end = points[points.length - 1]
    const isMotion = assignment.kind === 'motion'
    const isBlitz = assignment.kind === 'qbRunIfBlitzed'

    // The first read stands out, on screen and on the wrist coach.
    const width = stroke * (isMotion ? 0.6 : isBlitz ? 0.75 : assignment.readOrder === 1 ? 1.45 : 1)
    const arrowLength = Math.max(width, stroke) * 3.4
    const tip = isMotion ? null : lastSegment(points)
    const head = tip && arrowHead(tip[0], tip[1], arrowLength, arrowLength * 0.9)
    // Stop the line inside the arrowhead so its round cap does not poke out of the tip.
    const length = pathLength(points)
    const line = head ? splitPath(points, Math.max(0, length - arrowLength * 0.6))[0] : points

    // A delayed release: the first yard and a half is dotted.
    const delay = isMotion || isBlitz ? 0 : (assignment.delayCounts ?? 0)
    const dotted = delay > 0 && length > 0 ? Math.min(t.len(1.5), length * 0.5) : 0
    const [wait, run] = dotted > 0 ? splitPath(line, dotted) : [[], line]

    let readLabel: PathShape['readLabel'] = null
    let note: PathShape['note'] = null
    if (tip && points.length > 1) {
      if (isBlitz) note = { text: 'run if blitzed', at: { x: end.x + stroke * 3, y: end.y + labelSize * 1.2 } }
      else if (assignment.readOrder) {
        // Past the arrow tip, along the direction of travel.
        const d = Math.hypot(tip[1].x - tip[0].x, tip[1].y - tip[0].y)
        readLabel = {
          text: String(assignment.readOrder),
          at: {
            x: end.x + ((tip[1].x - tip[0].x) / d) * labelSize,
            y: end.y + ((tip[1].y - tip[0].y) / d) * labelSize,
          },
        }
      }
    }

    paths.push({
      player,
      assignment,
      kind: assignment.kind,
      points,
      width,
      wait,
      run,
      dash: isMotion ? [stroke * 1.2, stroke * 1.8] : isBlitz ? [stroke * 2, stroke * 2] : null,
      waitDash: [stroke * 0.2, stroke * 2.2],
      head: head ?? null,
      setRing: isMotion && points.length > 1 ? { at: end, radius: stroke * 2.2, width: stroke * 0.6 } : null,
      delayLabel:
        delay > 0 && points.length > 1
          ? { text: `delay ${delay}`, at: { x: points[0].x + t.len(0.9), y: points[0].y - t.len(0.9) } }
          : null,
      readLabel,
      note,
    })
  }

  return { paths, handoffs }
}
