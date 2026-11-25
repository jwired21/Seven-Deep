import { fieldView } from '../geometry/fieldLayout'
import { sortPlays } from '../library/library'
import { formatYd } from '../model/format'
import type { Play, Playbook } from '../model/types'
import { getRoute, isTreeRoute } from '../routes/routeTree'
import { drawPlay, THEMES, type DiagramTheme } from './drawPlay'
import type { Box, Surface } from './surface'

/** US Letter, portrait, in points. A point is 1/72 inch. */
export const LETTER = { width: 612, height: 792 }

/** Half an inch, inside what any home printer can reach. */
export const PAGE_MARGIN = 36

export type PlaysPerPage = 1 | 4 | 8

export type PlaybookPdfOptions = {
  perPage: PlaysPerPage
  /** 'paper' is white with darkened lines. 'screen' is the designer's green field. */
  theme: keyof typeof THEMES
}

export const DEFAULT_PDF_OPTIONS: PlaybookPdfOptions = { perPage: 4, theme: 'paper' }

const GRID: Record<PlaysPerPage, { columns: number; rows: number; gap: number; title: number; sub: number }> = {
  1: { columns: 1, rows: 1, gap: 0, title: 20, sub: 10 },
  4: { columns: 2, rows: 2, gap: 18, title: 13, sub: 8 },
  8: { columns: 2, rows: 4, gap: 12, title: 10, sub: 7 },
}

const HEADER_HEIGHT = 22

export type PageLayout = {
  header: Box
  /** One box per play, left to right, then top to bottom. */
  cells: Box[]
}

/** Where everything goes on a page, in points from the top left. */
export function playbookLayout(perPage: PlaysPerPage): PageLayout {
  const { columns, rows, gap } = GRID[perPage]
  const header: Box = { x: PAGE_MARGIN, y: PAGE_MARGIN, width: LETTER.width - PAGE_MARGIN * 2, height: HEADER_HEIGHT }
  const top = header.y + header.height + 10
  const width = (header.width - gap * (columns - 1)) / columns
  const height = (LETTER.height - PAGE_MARGIN - top - gap * (rows - 1)) / rows

  const cells: Box[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({ x: PAGE_MARGIN + column * (width + gap), y: top + row * (height + gap), width, height })
    }
  }
  return { header, cells }
}

/** The plays in call-number order, split into pages. */
export function paginate(plays: Play[], perPage: PlaysPerPage): Play[][] {
  const ordered = sortPlays(plays)
  const pages: Play[][] = []
  for (let i = 0; i < ordered.length; i += perPage) pages.push(ordered.slice(i, i + perPage))
  return pages
}

/** The QB's progression in words: "1 Y in, 2 Z corner". Empty when no reads are marked. */
export function readOrderText(play: Play): string {
  return play.assignments
    .filter((a) => a.kind === 'route' && a.readOrder)
    .sort((a, b) => a.readOrder! - b.readOrder!)
    .map((a) => {
      const label = play.players.find((p) => p.id === a.playerId)?.label ?? '?'
      const name = isTreeRoute(a.routeName) ? getRoute(a.routeName)!.name.toLowerCase() : 'route'
      return `${a.readOrder} ${label} ${name}`
    })
    .join(', ')
}

const TEXT = '#12161C'
const MUTED = '#5F6B7A'
const ACCENT = '#C2570C'

/** Shortens text with "..." until it fits a width. */
function fit(surface: Surface, text: string, size: number, maxWidth: number, bold = false): string {
  if (surface.textWidth(text, size, bold) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && surface.textWidth(`${cut}...`, size, bold) > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}...`
}

/** One play in its cell: number and name, a line of details, and the diagram. */
export function drawPlayCell(
  surface: Surface,
  play: Play,
  playbook: Playbook,
  cell: Box,
  perPage: PlaysPerPage,
  theme: DiagramTheme,
  /** For a player card: who to highlight, and what to say under the title instead of the usual details. */
  card?: { highlightPlayerId: string; details: string },
) {
  const { title, sub } = GRID[perPage]
  const number = String(play.number)
  const numberWidth = surface.textWidth(number, title, true)
  const formationWidth = surface.textWidth(play.formation, sub)
  const baseline = cell.y + title * 0.85

  surface.text(number, { x: cell.x, y: baseline }, { size: title, color: ACCENT, bold: true })
  const nameX = cell.x + numberWidth + title * 0.5
  const nameRoom = cell.width - (nameX - cell.x) - formationWidth - title * 0.6
  surface.text(fit(surface, play.name || 'Untitled', title, nameRoom, true), { x: nameX, y: baseline }, { size: title, color: TEXT, bold: true })
  surface.text(play.formation, { x: cell.x + cell.width, y: baseline }, { size: sub, color: MUTED, align: 'right' })

  const details = card ? [card.details] : [
    `Ball on the ${formatYd(play.ballOn)}`,
    play.tags.join(', '),
    readOrderText(play) && `Reads: ${readOrderText(play)}`,
  ].filter(Boolean)
  const subBaseline = baseline + sub * 1.5
  surface.text(
    fit(surface, details.join('  ·  '), sub, cell.width, !!card),
    { x: cell.x, y: subBaseline },
    { size: sub, color: card ? TEXT : MUTED, bold: !!card },
  )

  const top = subBaseline + sub * 0.8
  const room = cell.y + cell.height - top
  // Size the box to the field's own shape, so the diagram sits right under its title
  // instead of floating in the middle of the cell.
  const view = fieldView(play.ballOn, playbook.rules)
  const shape = (view.yMax - view.yMin) / (view.xMax - view.xMin)
  const diagram: Box = { x: cell.x, y: top, width: cell.width, height: Math.min(room, cell.width * shape) }
  return drawPlay(surface, play, playbook.rules, diagram, { theme, highlightPlayerId: card?.highlightPlayerId })
}

/** One page: the playbook name across the top, then its plays. */
export function drawPlaybookPage(
  surface: Surface,
  playbook: Playbook,
  plays: Play[],
  page: number,
  pageCount: number,
  options: PlaybookPdfOptions,
) {
  const layout = playbookLayout(options.perPage)
  const { header } = layout
  const baseline = header.y + 13
  surface.text(playbook.name || 'Playbook', { x: header.x, y: baseline }, { size: 13, color: TEXT, bold: true })
  surface.text(
    `${playbook.rules.name}  ·  Page ${page} of ${pageCount}`,
    { x: header.x + header.width, y: baseline },
    { size: 8, color: MUTED, align: 'right' },
  )
  surface.polyline(
    [
      { x: header.x, y: header.y + header.height },
      { x: header.x + header.width, y: header.y + header.height },
    ],
    { color: '#C9CED6', width: 0.5 },
  )

  plays.forEach((play, i) => drawPlayCell(surface, play, playbook, layout.cells[i], options.perPage, THEMES[options.theme]))
  return layout
}
