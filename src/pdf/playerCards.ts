import { sortPlays } from '../library/library'
import { LINEUP, POSITION_NAMES } from '../model/players'
import type { Assignment, Play, Playbook, Player } from '../model/types'
import { getAssignment } from '../routes/assignments'
import { getRoute, isTreeRoute } from '../routes/routeTree'
import { PAPER } from './drawPlay'
import { drawPlayCell, playbookLayout, type PageLayout } from './playbookPages'
import { printColor } from './printColor'
import type { Surface } from './surface'

/** How many plays go on each page of a card. */
export type CardPlaysPerPage = 4 | 8

export type PlayerCardOptions = { perPage: CardPlaysPerPage }

export const DEFAULT_CARD_OPTIONS: PlayerCardOptions = { perPage: 8 }

/**
 * Every position in the playbook, in lineup order (QB, C, RB, X, Y, Z, W), followed by
 * any relabeled players in the order they first appear.
 */
export function cardLabels(plays: Play[]): string[] {
  const seen = new Set<string>()
  for (const play of sortPlays(plays)) for (const player of play.players) seen.add(player.label)
  const known = LINEUP.filter((label) => seen.has(label))
  return [...known, ...[...seen].filter((label) => !known.includes(label as (typeof LINEUP)[number]))]
}

const templateName = (a: Assignment) => (isTreeRoute(a.routeName) ? getRoute(a.routeName)!.name : null)

/**
 * One player's job on a play, in words a player can read at a glance:
 * "Out at 5 yd · read 1", "Motion, then slant at 2 yd", "Take the handoff · sweep".
 */
export function jobText(play: Play, player: Player): string {
  const main = getAssignment(play, player.id)
  const motion = getAssignment(play, player.id, 'motion')
  const blitz = getAssignment(play, player.id, 'blitz')
  const handedTo = play.assignments.find((a) => a.kind === 'handoff' && a.handoffTo === player.id)
  const giver = play.players.find((p) => p.id === handedTo?.playerId)
  const anyRoutes = play.assignments.some((a) => a.kind === 'route')

  let job: string
  if (main?.kind === 'route') {
    const name = templateName(main)
    job = name ? `${name} at ${main.routeDepth} yd` : 'Route as drawn'
  } else if (main?.kind === 'run') {
    const name = templateName(main) ?? 'Run as drawn'
    job = giver ? `Take the handoff from ${giver.label} · ${name.toLowerCase()}` : name
  } else if (main?.kind === 'handoff') {
    const carrier = play.players.find((p) => p.id === main.handoffTo)
    job = `Hand off to ${carrier?.label ?? '?'}`
  } else if (main?.kind === 'block') {
    job = 'Block'
  } else if (player.label === 'QB') {
    job = anyRoutes ? 'Throw' : 'No assignment'
  } else if (player.label === 'C') {
    job = 'Snap'
  } else {
    job = 'No assignment'
  }

  // The center always snaps first, and a player in motion moves first.
  if (player.label === 'C' && job !== 'Snap') job = `Snap, then ${job.charAt(0).toLowerCase()}${job.slice(1)}`
  if (motion && motion.path.length > 0) job = `Motion, then ${job.charAt(0).toLowerCase()}${job.slice(1)}`

  const extras = [
    main?.delayCounts && `delay ${main.delayCounts}`,
    main?.kind === 'route' && main.readOrder && `read ${main.readOrder}`,
    blitz && `if blitzed, ${(templateName(blitz) ?? 'run as drawn').toLowerCase()}`,
  ].filter(Boolean)
  return [job, ...extras].join(' · ')
}

/** One page of one position's card. */
export type CardPage = {
  label: string
  plays: Play[]
  /** 1 for the first page of this position's card. */
  page: number
  /** How many pages this position's card has. */
  pages: number
}

/** Every page of every card: all the plays for the first position, then the next, and so on. */
export function playerCardPages(playbook: Playbook, options: PlayerCardOptions = DEFAULT_CARD_OPTIONS): CardPage[] {
  const plays = sortPlays(playbook.plays)
  const chunks: Play[][] = []
  for (let i = 0; i < plays.length; i += options.perPage) chunks.push(plays.slice(i, i + options.perPage))
  if (chunks.length === 0) chunks.push([])
  return cardLabels(plays).flatMap((label) =>
    chunks.map((chunk, i) => ({ label, plays: chunk, page: i + 1, pages: chunks.length })),
  )
}

const TEXT = '#12161C'
const MUTED = '#5F6B7A'

/**
 * One page of a player card: the position's marker and name across the top, then every
 * play with that player in color, everyone else faded, and the player's job in words.
 */
export function drawPlayerCardPage(
  surface: Surface,
  playbook: Playbook,
  card: CardPage,
  options: PlayerCardOptions = DEFAULT_CARD_OPTIONS,
): PageLayout {
  const layout = playbookLayout(options.perPage)
  const { header } = layout
  const sample = card.plays.flatMap((p) => p.players).find((p) => p.label === card.label)
  const color = sample?.color ?? '#FFFFFF'

  // The position's marker, as on the field: a square for the center, a circle for everyone else.
  const r = 9
  const center = { x: header.x + r, y: header.y + r }
  const marker = { fill: color, stroke: { color: printColor(color, 4.5), width: 1 } }
  if (card.label === 'C') surface.rect({ x: center.x - r * 0.93, y: center.y - r * 0.93, width: r * 1.86, height: r * 1.86 }, marker)
  else surface.circle(center, r, marker)
  const size = card.label.length > 1 ? 7.5 : 9
  surface.text(card.label, { x: center.x, y: center.y + size * 0.36 }, { size, color: TEXT, bold: true, align: 'center' })

  const baseline = header.y + 13
  const name = POSITION_NAMES[card.label] ?? 'Player'
  surface.text(`${card.label} · ${name} card`, { x: header.x + r * 2 + 8, y: baseline }, { size: 13, color: TEXT, bold: true })
  surface.text(
    `${playbook.name || 'Playbook'}  ·  Page ${card.page} of ${card.pages}`,
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

  card.plays.forEach((play, i) => {
    const player = play.players.find((p) => p.label === card.label)
    drawPlayCell(surface, play, playbook, layout.cells[i], options.perPage, PAPER, {
      // An id nobody has fades everyone, for a play this position is not in.
      highlightPlayerId: player?.id ?? '',
      details: player ? jobText(play, player) : 'Not in this play',
    })
  })
  return layout
}
