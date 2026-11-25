import type { FieldView } from '../geometry/fieldTransform'
import { fieldBounds } from '../geometry/snap'
import { sortPlays } from '../library/library'
import { DEFAULT_WRIST_COACH } from '../model/defaults'
import type { Play, Playbook, RulesProfile, WristCoachLayout } from '../model/types'
import { absolutePath } from '../routes/assignments'
import { drawPlay, MONO, PAPER } from './drawPlay'
import { LETTER, PAGE_MARGIN } from './playbookPages'
import type { Box, Surface } from './surface'

/** Points per inch. A PDF point is 1/72 inch. */
export const PT_PER_IN = 72

/** The words that must be on every sheet. */
export const PRINT_NOTICE = 'Print at 100%. Do not fit to page.'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const GRIDS: Record<WristCoachLayout['playsPerWindow'], { columns: number; rows: number }> = {
  4: { columns: 2, rows: 2 },
  6: { columns: 3, rows: 2 },
  8: { columns: 4, rows: 2 },
  12: { columns: 4, rows: 3 },
}

/** Keeps the settings printable: a window always fits on the page. */
export function sanitizeWristCoach(layout: WristCoachLayout): WristCoachLayout {
  const inches = (v: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, lo, hi) : fallback
  const { playerLabel, ...rest } = layout
  return {
    ...rest,
    // The printable width of US Letter with half-inch margins is 7.5 inches.
    windowWidthIn: inches(layout.windowWidthIn, 2, 7.5, DEFAULT_WRIST_COACH.windowWidthIn),
    windowHeightIn: inches(layout.windowHeightIn, 1, 6, DEFAULT_WRIST_COACH.windowHeightIn),
    windows: Number.isFinite(layout.windows) ? clamp(Math.round(layout.windows), 1, 12) : DEFAULT_WRIST_COACH.windows,
    playsPerWindow: layout.playsPerWindow in GRIDS ? layout.playsPerWindow : DEFAULT_WRIST_COACH.playsPerWindow,
    mode: layout.mode === 'player' ? 'player' : 'qb',
    color: layout.color !== false,
    ...(playerLabel ? { playerLabel } : {}),
  }
}

/** One window to cut out, and which plays go in it. */
export type WindowLayout = {
  /** The cut rectangle, exactly the window size. */
  box: Box
  /** 1 for the first window of the band. */
  number: number
  /** Index of its first play in the call-number-ordered list. */
  firstPlay: number
}

export type SheetLayout = {
  /** Baselines of the two header lines. */
  header: { x: number; right: number; title: number; notice: number }
  /** The 1-inch bracket: a horizontal line from `x` to `x + length` at `y`. */
  calibration: { x: number; y: number; length: number }
  windows: WindowLayout[]
  /** Where the call key goes, and how many columns it has. */
  key: Box & { columns: number }
}

const HEADER_TITLE_Y = PAGE_MARGIN + 10
const HEADER_NOTICE_Y = HEADER_TITLE_Y + 15
const CALIBRATION_Y = HEADER_NOTICE_Y + 18
const WINDOWS_TOP = CALIBRATION_Y + 16
const WINDOW_GAP = 16
const KEY_GAP = 18
const KEY_LINE = 10.5
/** The narrowest column the call key is still readable in. */
const KEY_MIN_WIDTH = 120

/** Height of a call key that sits below the windows, for the plays on one page. */
const keyBelowHeight = (plays: number) => 14 + Math.ceil(plays / 3) * KEY_LINE

/**
 * Lays out every sheet. Windows stack down the left of the page, with the call key beside
 * them. When the windows are too wide for that, the key goes below them. When they are too
 * tall to all fit, the rest carry on to more sheets.
 */
export function wristCoachSheets(layout: WristCoachLayout, playCount: number): SheetLayout[] {
  const settings = sanitizeWristCoach(layout)
  const width = settings.windowWidthIn * PT_PER_IN
  const height = settings.windowHeightIn * PT_PER_IN
  const perWindow = settings.playsPerWindow
  // At least the band's own windows, and more when the playbook has more plays than they hold.
  const total = Math.max(settings.windows, Math.ceil(playCount / perWindow))

  const right = LETTER.width - PAGE_MARGIN
  const bottom = LETTER.height - PAGE_MARGIN
  const keyX = PAGE_MARGIN + width + KEY_GAP
  const beside = right - keyX >= KEY_MIN_WIDTH
  const room = bottom - WINDOWS_TOP

  // How many windows fit down one page, leaving space for the key when it goes below.
  let perPage = Math.max(1, Math.floor((room + WINDOW_GAP) / (height + WINDOW_GAP)))
  if (!beside) {
    while (perPage > 1 && perPage * height + (perPage - 1) * WINDOW_GAP + KEY_GAP + keyBelowHeight(perPage * perWindow) > room) {
      perPage--
    }
  }

  const sheets: SheetLayout[] = []
  for (let first = 0; first < total; first += perPage) {
    const count = Math.min(perPage, total - first)
    const windows: WindowLayout[] = Array.from({ length: count }, (_, i) => ({
      box: { x: PAGE_MARGIN, y: WINDOWS_TOP + i * (height + WINDOW_GAP), width, height },
      number: first + i + 1,
      firstPlay: (first + i) * perWindow,
    }))
    const stackBottom = WINDOWS_TOP + count * height + (count - 1) * WINDOW_GAP
    sheets.push({
      header: { x: PAGE_MARGIN, right, title: HEADER_TITLE_Y, notice: HEADER_NOTICE_Y },
      calibration: { x: PAGE_MARGIN, y: CALIBRATION_Y, length: PT_PER_IN },
      windows,
      key: beside
        ? { x: keyX, y: WINDOWS_TOP, width: right - keyX, height: bottom - WINDOWS_TOP, columns: 1 }
        : { x: PAGE_MARGIN, y: stackBottom + KEY_GAP, width: right - PAGE_MARGIN, height: Math.max(0, bottom - stackBottom - KEY_GAP), columns: 3 },
    })
  }
  return sheets
}

/** The grid of play cells inside one window, left to right, then top to bottom. */
export function windowCells(window: Box, playsPerWindow: WristCoachLayout['playsPerWindow']): Box[] {
  const { columns, rows } = GRIDS[playsPerWindow]
  // Keep clear of the cut line, so a slightly off cut does not clip a diagram.
  const inset = 3
  const width = (window.width - inset * 2) / columns
  const height = (window.height - inset * 2) / rows
  const cells: Box[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ x: window.x + inset + column * width, y: window.y + inset + row * height, width, height })
    }
  }
  return cells
}

/**
 * A view cropped to where the play happens: full width, from just behind the deepest player
 * to just past the deepest route. A wrist coach diagram is tiny, so no space is spent on
 * empty field.
 */
export function compactView(play: Play, rules: RulesProfile): FieldView {
  const bounds = fieldBounds(play.ballOn, rules)
  const ys = play.players.map((p) => p.start.y)
  for (const assignment of play.assignments) {
    const player = play.players.find((p) => p.id === assignment.playerId)
    if (player) for (const p of absolutePath(play, player, assignment)) ys.push(p.y)
  }
  return {
    xMin: bounds.xMin - 0.75,
    xMax: bounds.xMax + 0.75,
    yMin: Math.max(bounds.yMin, Math.min(...ys) - 2),
    // Always show at least 6 yards past the line of scrimmage, so a run play still has a field.
    yMax: Math.min(bounds.yMax, Math.max(...ys, 6) + 2),
  }
}

const TEXT = '#12161C'
const MUTED = '#5F6B7A'
const CUT = '#3D444D'

function fit(surface: Surface, text: string, size: number, maxWidth: number, bold = false): string {
  if (surface.textWidth(text, size, bold) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && surface.textWidth(`${cut}..`, size, bold) > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}..`
}

/** One play in its cell: the call number in bold, the name, and a mini diagram. */
export function drawWristCell(surface: Surface, play: Play, playbook: Playbook, cell: Box) {
  const settings = sanitizeWristCoach(playbook.wristCoach)
  const pad = 1.5
  const numberSize = clamp(cell.height * 0.14, 6, 11)
  const nameSize = numberSize * 0.72
  const baseline = cell.y + pad + numberSize * 0.8
  const number = String(play.number)
  const numberWidth = surface.textWidth(number, numberSize, true)

  surface.text(number, { x: cell.x + pad, y: baseline }, { size: numberSize, color: TEXT, bold: true })
  const nameX = cell.x + pad + numberWidth + numberSize * 0.35
  surface.text(
    fit(surface, play.name || 'Untitled', nameSize, cell.x + cell.width - pad - nameX),
    { x: nameX, y: baseline },
    { size: nameSize, color: TEXT },
  )

  const top = cell.y + pad + numberSize * 1.05
  const view = compactView(play, playbook.rules)
  const width = cell.width - pad * 2
  const room = cell.y + cell.height - pad - top
  // Size the box to the cropped field's own shape, so the diagram sits right under its
  // number instead of floating in the middle of the cell.
  const shape = (view.yMax - view.yMin) / (view.xMax - view.xMin)
  const diagram: Box = { x: cell.x + pad, y: top, width, height: Math.min(room, width * shape) }
  const highlighted =
    settings.mode === 'player' ? play.players.find((p) => p.label === settings.playerLabel)?.id : undefined

  return drawPlay(surface, play, playbook.rules, diagram, {
    theme: settings.color ? PAPER : MONO,
    view,
    fieldLabels: false,
    highlightPlayerId: settings.mode === 'player' ? (highlighted ?? '') : undefined,
    minStroke: 0.7,
    minMarker: 2,
  })
}

/** One sheet: the print notice, the 1-inch bracket, the windows with their cut lines, and the call key. */
export function drawWristCoachSheet(
  surface: Surface,
  playbook: Playbook,
  sheet: SheetLayout,
  page: number,
  pageCount: number,
) {
  const settings = sanitizeWristCoach(playbook.wristCoach)
  const plays = sortPlays(playbook.plays)
  const { header, calibration } = sheet

  const who = settings.mode === 'player' ? `Player sheet: ${settings.playerLabel ?? '?'}` : 'QB sheet'
  surface.text(`Wrist coach · ${playbook.name || 'Playbook'}`, { x: header.x, y: header.title }, { size: 12, color: TEXT, bold: true })
  surface.text(
    `${who}  ·  ${settings.windowWidthIn} x ${settings.windowHeightIn} in windows  ·  Sheet ${page} of ${pageCount}`,
    { x: header.right, y: header.title },
    { size: 8, color: MUTED, align: 'right' },
  )
  surface.text(PRINT_NOTICE, { x: header.x, y: header.notice }, { size: 10, color: TEXT, bold: true })

  // The 1-inch bracket. Square ends, so it measures exactly 72 points tick to tick.
  const ruler = { color: TEXT, width: 0.75, cap: 'butt' as const }
  const { x, y, length } = calibration
  surface.polyline([{ x, y }, { x: x + length, y }], ruler)
  surface.polyline([{ x, y: y - 4 }, { x, y: y + 4 }], ruler)
  surface.polyline([{ x: x + length, y: y - 4 }, { x: x + length, y: y + 4 }], ruler)
  surface.text(
    '1 inch. Measure this line. If it is not exactly 1 inch, the sheet was scaled and will not fit.',
    { x: x + length + 8, y: y + 3 },
    { size: 8, color: MUTED },
  )

  const keyLines: { text: string; bold: boolean }[] = []
  for (const window of sheet.windows) {
    const inWindow = plays.slice(window.firstPlay, window.firstPlay + settings.playsPerWindow)
    const cells = windowCells(window.box, settings.playsPerWindow)
    inWindow.forEach((play, i) => drawWristCell(surface, play, playbook, cells[i]))

    // Hairlines between cells, then the dashed cut line, exactly on the edge of the window.
    const grid = GRIDS[settings.playsPerWindow]
    const divider = { color: '#C9CED6', width: 0.4, cap: 'butt' as const }
    for (let c = 1; c < grid.columns; c++) {
      const cx = cells[c].x
      surface.polyline([{ x: cx, y: window.box.y + 3 }, { x: cx, y: window.box.y + window.box.height - 3 }], divider)
    }
    for (let r = 1; r < grid.rows; r++) {
      const cy = cells[r * grid.columns].y
      surface.polyline([{ x: window.box.x + 3, y: cy }, { x: window.box.x + window.box.width - 3, y: cy }], divider)
    }
    surface.rect(window.box, { stroke: { color: CUT, width: 0.6, dash: [3, 3], cap: 'butt' } })

    keyLines.push({ text: `Window ${window.number}`, bold: true })
    if (inWindow.length === 0) keyLines.push({ text: 'empty', bold: false })
    for (const play of inWindow) keyLines.push({ text: `${play.number}  ${play.name || 'Untitled'}`, bold: false })
  }

  // The call key: every number and name, beside the windows or below them.
  const { key } = sheet
  surface.text('CALL KEY', { x: key.x, y: key.y + 7 }, { size: 7, color: MUTED, bold: true })
  const columnWidth = key.width / key.columns
  const perColumn = Math.max(1, Math.ceil(keyLines.length / key.columns))
  keyLines.forEach((line, i) => {
    const column = Math.floor(i / perColumn)
    const row = i % perColumn
    const at = { x: key.x + column * columnWidth, y: key.y + 20 + row * KEY_LINE }
    surface.text(fit(surface, line.text, 8, columnWidth - 6, line.bold), at, { size: 8, color: line.bold ? MUTED : TEXT, bold: line.bold })
  })
}
