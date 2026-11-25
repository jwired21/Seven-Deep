import { FIELD_COLORS } from '../field/fieldColors'
import { fieldMarkings, fieldView } from '../geometry/fieldLayout'
import { createFieldTransform, type FieldView, type RectYd } from '../geometry/fieldTransform'
import type { Vec } from '../geometry/path'
import { formatYd } from '../model/format'
import type { Play, Point, RulesProfile } from '../model/types'
import { routeShapes, type ToUnits } from '../routes/routeShapes'
import { blend, printColor } from './printColor'
import type { Box, Surface } from './surface'

/** The colors of a diagram. Everything is opaque, so the PDF needs no transparency. */
export type DiagramTheme = {
  name: 'paper' | 'screen'
  apron: string
  turf: string
  endZone: string
  noRunZone: string
  yardLine: string
  sideline: string
  goalLine: string
  firstDown: string
  scrimmage: string
  fieldText: string
  border: string
  /** Text drawn on the field: "delay 1", "handoff". */
  noteText: string
  /** Text inside a player marker. */
  markerText: string
  ball: string
  /** The color for a position's lines. */
  line(playerColor: string): string
  markerFill(playerColor: string): string
  markerEdge(playerColor: string): string
}

/** White paper, pale field markings, and lines darkened where the screen color is too light. Saves ink. */
export const PAPER: DiagramTheme = {
  name: 'paper',
  apron: '#FFFFFF',
  turf: '#FFFFFF',
  endZone: '#EEF2EE',
  noRunZone: blend(FIELD_COLORS.noRunZone, '#FFFFFF', 0.16),
  yardLine: '#C9CED6',
  sideline: '#6B7480',
  goalLine: '#3D444D',
  firstDown: '#B8860B',
  scrimmage: '#1F6FB5',
  fieldText: '#6B7480',
  border: '#6B7480',
  noteText: '#3D444D',
  markerText: '#12161C',
  ball: FIELD_COLORS.ball,
  line: (color) => printColor(color),
  markerFill: (color) => color,
  markerEdge: (color) => printColor(color, 4.5),
}

/** The same greens as the designer. */
export const SCREEN: DiagramTheme = {
  name: 'screen',
  apron: FIELD_COLORS.apron,
  turf: FIELD_COLORS.turf,
  endZone: FIELD_COLORS.endZone,
  noRunZone: blend(FIELD_COLORS.noRunZone, FIELD_COLORS.turf, 0.28),
  yardLine: blend(FIELD_COLORS.line, FIELD_COLORS.turf, 0.35),
  sideline: blend(FIELD_COLORS.line, FIELD_COLORS.turf, 0.7),
  goalLine: blend(FIELD_COLORS.line, FIELD_COLORS.turf, 0.9),
  firstDown: FIELD_COLORS.firstDown,
  scrimmage: FIELD_COLORS.scrimmage,
  fieldText: blend(FIELD_COLORS.line, FIELD_COLORS.turf, 0.6),
  border: FIELD_COLORS.apron,
  noteText: '#FFFFFF',
  markerText: '#12161C',
  ball: FIELD_COLORS.ball,
  line: (color) => color,
  markerFill: (color) => color,
  markerEdge: (color) => color,
}

/** Black and white, for a printer with no color or to save ink. */
export const MONO: DiagramTheme = {
  ...PAPER,
  noRunZone: '#E9E9E9',
  firstDown: '#6B7480',
  scrimmage: '#6B7480',
  ball: '#6B7480',
  line: () => '#1A1A1A',
  markerFill: () => '#FFFFFF',
  markerEdge: () => '#1A1A1A',
}

/** How everyone else is drawn when one player is highlighted. */
const FADED = { line: '#C3C8D0', markerFill: '#F1F2F4', markerEdge: '#B4BAC4', text: '#9AA1AC' }

export const THEMES = { paper: PAPER, screen: SCREEN }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export type DiagramOptions = {
  theme?: DiagramTheme
  /** Yard numbers and zone names on the field. Left off automatically when the diagram is tiny. */
  fieldLabels?: boolean
  /** The part of the field to show. Defaults to the designer's view. */
  view?: FieldView
  /** Draw this player in color and everyone else faded, for a player's own card. */
  highlightPlayerId?: string
  /** Floors for line weight and marker radius, in points, so a tiny diagram still prints clearly. */
  minStroke?: number
  minMarker?: number
}

export type DrawnDiagram = {
  /** Where the field landed inside the box, in points. */
  field: Box
  /** Points per yard. */
  scale: number
  /** Yards to points on the page. */
  toPt(p: Point): Vec
}

/**
 * Draws one play, to scale, into a box on a surface.
 *
 * It uses the same view of the field, the same yards-to-units transform, and the same route
 * geometry as the designer, so the printed diagram matches the screen.
 */
export function drawPlay(
  surface: Surface,
  play: Play,
  rules: RulesProfile,
  box: Box,
  options: DiagramOptions = {},
): DrawnDiagram {
  const theme = options.theme ?? PAPER
  const view = options.view ?? fieldView(play.ballOn, rules)
  const t = createFieldTransform(view, { width: box.width, height: box.height })
  const highlight = options.highlightPlayerId
  const faded = (playerId: string) => highlight !== undefined && playerId !== highlight
  // Faded players are drawn first, so the highlighted one sits on top.
  const fadedFirst = <T,>(items: T[], idOf: (item: T) => string) =>
    [...items].sort((a, b) => Number(!faded(idOf(a))) - Number(!faded(idOf(b))))
  const m = fieldMarkings(play.ballOn, rules, view)
  const scale = t.scale

  const toPt = (p: Point): Vec => {
    const px = t.toPx(p)
    return { x: box.x + px.x, y: box.y + px.y }
  }
  const units: ToUnits = { toPx: toPt, len: t.len }
  const rect = (r: RectYd): Box => {
    const px = t.rectToPx(r)
    return { x: box.x + px.x, y: box.y + px.y, width: px.width, height: px.height }
  }
  const field: Box = { x: box.x + t.viewPx.x, y: box.y + t.viewPx.y, width: t.viewPx.width, height: t.viewPx.height }
  if (scale <= 0) return { field, scale, toPt }

  const half = rules.fieldWidth / 2
  const across = (y: number): Vec[] => [toPt({ x: -half, y }), toPt({ x: half, y })]

  const stroke = clamp(scale * 0.2, options.minStroke ?? 0.5, 2.6)
  const labelSize = clamp(scale * 0.7, 3.5, 9)
  const fieldLabels = options.fieldLabels ?? scale >= 5
  const hair = clamp(scale * 0.05, 0.25, 0.6)

  surface.clip(field, () => {
    surface.rect(field, { fill: theme.apron })
    const turf = rect(m.turf)
    surface.rect(turf, { fill: theme.turf })
    if (m.endZone) surface.rect(rect(m.endZone), { fill: theme.endZone })
    if (m.ownEndZone) surface.rect(rect(m.ownEndZone), { fill: theme.endZone })
    if (m.noRunZone) surface.rect(rect(m.noRunZone), { fill: theme.noRunZone })

    for (const line of m.yardLines) surface.polyline(across(line.y), { color: theme.yardLine, width: hair })
    for (const x of [-half, half]) {
      surface.polyline(
        [
          { x: toPt({ x, y: 0 }).x, y: turf.y },
          { x: toPt({ x, y: 0 }).x, y: turf.y + turf.height },
        ],
        { color: theme.sideline, width: hair * 2 },
      )
    }
    if (m.goalLineY !== null) surface.polyline(across(m.goalLineY), { color: theme.goalLine, width: hair * 3 })
    if (m.ownGoalLineY !== null) surface.polyline(across(m.ownGoalLineY), { color: theme.goalLine, width: hair * 3 })
    if (m.midfieldY !== null) surface.polyline(across(m.midfieldY), { color: theme.firstDown, width: hair * 3 })
    surface.polyline(across(m.lineOfScrimmageY), {
      color: theme.scrimmage,
      width: hair * 2.5,
      dash: [hair * 2.5, hair * 7],
    })

    if (fieldLabels) {
      const pad = labelSize * 0.5
      const left = toPt({ x: -half, y: 0 }).x + pad
      for (const line of m.yardLines) {
        surface.text(String(line.yardsFromGoal), { x: left, y: toPt({ x: 0, y: line.y }).y - pad * 0.6 }, { size: labelSize, color: theme.fieldText })
      }
      if (m.endZone) {
        const zone = rect(m.endZone)
        if (zone.height >= labelSize * 2.4) {
          surface.text('END ZONE', { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 + labelSize * 0.4 }, { size: labelSize * 1.2, color: theme.fieldText, align: 'center' })
        }
      }
      if (m.noRunZone) {
        const zone = rect(m.noRunZone)
        if (zone.height >= labelSize * 1.5) {
          surface.text(`NO-RUN ZONE · ${formatYd(rules.noRunZone)} YD`, { x: left, y: zone.y + labelSize * 1.1 }, { size: labelSize * 0.85, color: theme.fieldText })
        }
      }
      if (m.midfieldY !== null) {
        surface.text('MIDFIELD · FIRST DOWN', { x: toPt({ x: half, y: 0 }).x - pad, y: toPt({ x: 0, y: m.midfieldY }).y + labelSize * 1.1 }, { size: labelSize * 0.85, color: theme.firstDown, align: 'right' })
      }
    }

    surface.circle(toPt({ x: 0, y: 0 }), Math.max(0.6, t.len(0.3)), { fill: theme.ball })

    // Routes, runs, motion, and handoffs: the same shapes the designer draws.
    const { paths, handoffs } = routeShapes(play, units, stroke, labelSize)
    const notes = scale >= 5

    for (const h of fadedFirst(handoffs, (x) => x.player.id)) {
      const color = faded(h.player.id) ? FADED.line : theme.line(h.player.color)
      surface.polyline([h.from, h.to], { color, width: h.width })
      surface.circle(h.to, h.ring.radius, { fill: theme.turf, stroke: { color, width: h.ring.width } })
      if (notes) surface.text(h.label.text, h.label.at, { size: labelSize, color: theme.noteText, align: 'center' })
    }

    for (const shape of fadedFirst(paths, (x) => x.player.id)) {
      const dim = faded(shape.player.id)
      const color = dim ? FADED.line : theme.line(shape.player.color)
      if (shape.wait.length > 1) surface.polyline(shape.wait, { color, width: shape.width, dash: shape.waitDash })
      if (shape.run.length > 1) surface.polyline(shape.run, { color, width: shape.width, dash: shape.dash })
      if (shape.head) surface.polygon(shape.head, { fill: color })
      if (shape.setRing) surface.circle(shape.setRing.at, shape.setRing.radius, { stroke: { color, width: shape.setRing.width } })
      if (notes && !dim && shape.delayLabel) surface.text(shape.delayLabel.text, shape.delayLabel.at, { size: labelSize, color: theme.noteText })
      if (notes && !dim && shape.note) surface.text(shape.note.text, shape.note.at, { size: labelSize, color: theme.noteText })
      if (shape.readLabel) {
        const size = Math.max(labelSize * 1.15, 4)
        surface.text(shape.readLabel.text, { x: shape.readLabel.at.x, y: shape.readLabel.at.y + size * 0.36 }, { size, color, bold: true, align: 'center' })
      }
    }

    // Players on top, as on screen. The center is a square.
    const r = clamp(scale * 0.85, options.minMarker ?? 1.6, 11)
    for (const player of fadedFirst(play.players, (x) => x.id)) {
      const at = toPt(player.start)
      const dim = faded(player.id)
      const style = {
        fill: dim ? FADED.markerFill : theme.markerFill(player.color),
        stroke: { color: dim ? FADED.markerEdge : theme.markerEdge(player.color), width: clamp(r * 0.12, 0.3, 1) },
      }
      if (player.label === 'C') surface.rect({ x: at.x - r * 0.93, y: at.y - r * 0.93, width: r * 1.86, height: r * 1.86 }, style)
      else surface.circle(at, r, style)
      if (r >= 4) {
        const size = r * (player.label.length > 1 ? 0.8 : 0.95)
        surface.text(player.label, { x: at.x, y: at.y + size * 0.36 }, { size, color: dim ? FADED.text : theme.markerText, bold: true, align: 'center' })
      }
    }
  })

  surface.rect(field, { stroke: { color: theme.border, width: hair * 2 } })
  return { field, scale, toPt }
}
