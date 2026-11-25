import { PDFDocument } from '@cantoo/pdf-lib'
import { beforeEach, describe, expect, it } from 'vitest'
import { POSITION_COLORS } from '../model/players'
import type { Playbook } from '../model/types'
import { resetEditor, toPlaybook, useEditor } from '../store/editorStore'
import { cardLabels, drawPlayerCardPage, jobText, playerCardPages } from './playerCards'
import { buildPlayerCardsPdf } from './playbookPdf'
import { printColor } from './printColor'
import { RecordingSurface } from './surface'

const state = () => useEditor.getState()
const player = (label: string) => state().play.players.find((p) => p.label === label)!
const idOf = (label: string) => player(label).id
const job = (label: string) => jobText(state().play, player(label))

/** `count` plays. The first is a pass with reads, a delay, motion, and a QB run. The second is a sweep. */
function buildPlaybook(count = 2): Playbook {
  resetEditor()
  state().renamePlaybook('Tuesday Night')
  state().renamePlay('Mesh Flood')
  state().setRoute(idOf('Y'), 'in')
  state().setReadOrder(idOf('Y'), 1)
  state().setRoute(idOf('Z'), 'corner')
  state().setReadOrder(idOf('Z'), 2)
  state().setRoute(idOf('C'), 'hitch')
  state().setDelay(idOf('C'), 1)
  state().setRoute(idOf('QB'), 'roll')
  state().startFreehand(idOf('X'), 'motion')
  state().addWaypoint({ x: -12, y: -2 })
  state().stopFreehand()
  state().setRoute(idOf('X'), 'slant')
  for (let i = 1; i < count; i++) {
    state().newPlay()
    state().renamePlay(i === 1 ? 'Sweep Right' : `Play ${i + 1}`)
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
  }
  return structuredClone(toPlaybook(state()))
}

/** The colors of every line and arrowhead drawn inside the diagrams. */
const inkOn = (surface: RecordingSurface) =>
  new Set(surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke.color] : o.op === 'polygon' ? [o.style.fill ?? ''] : [])))

beforeEach(resetEditor)

describe('the check that proves the phase', () => {
  it('exports all 7 cards in one PDF', async () => {
    const playbook = buildPlaybook()
    const pages = playerCardPages(playbook)
    expect(pages.map((p) => p.label)).toEqual(['QB', 'C', 'RB', 'X', 'Y', 'Z', 'W'])

    const bytes = await buildPlayerCardsPdf(playbook)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(7)
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBe(612)
      expect(page.getHeight()).toBe(792)
    }
    expect(pdf.getTitle()).toBe('Player cards - Tuesday Night')
  })

  it('draws each card with that player in color and everyone else faded', () => {
    const playbook = buildPlaybook()
    const routeRunners = ['Y', 'Z', 'C', 'X', 'RB']
    for (const card of playerCardPages(playbook)) {
      const surface = new RecordingSurface()
      drawPlayerCardPage(surface, playbook, card)
      const ink = inkOn(surface)
      for (const label of routeRunners) {
        const color = printColor(POSITION_COLORS[label])
        // A player's color appears on their own card, and on nobody else's.
        expect(ink.has(color), `${label}'s color on ${card.label}'s card`).toBe(label === card.label)
      }
      // Everyone else's lines are there, in the faded gray.
      expect(ink.has('#C3C8D0'), `faded lines on ${card.label}'s card`).toBe(true)
    }
  })
})

describe('cards', () => {
  it('titles each card with the position', () => {
    const playbook = buildPlaybook()
    const [qb, center] = playerCardPages(playbook)
    const draw = (card: typeof qb) => {
      const surface = new RecordingSurface()
      drawPlayerCardPage(surface, playbook, card)
      return surface.texts()
    }
    expect(draw(qb)).toContain('QB · Quarterback card')
    expect(draw(center)).toContain('C · Center card')
    expect(draw(qb).some((t) => t.includes('Tuesday Night') && t.includes('Page 1 of 1'))).toBe(true)
  })

  it('shows every play on the card, with its number and name', () => {
    const playbook = buildPlaybook(5)
    const surface = new RecordingSurface()
    drawPlayerCardPage(surface, playbook, playerCardPages(playbook)[2])
    const texts = surface.texts()
    for (const name of ['Mesh Flood', 'Sweep Right', 'Play 3', 'Play 4', 'Play 5']) expect(texts).toContain(name)
    expect(surface.ops.filter((o) => o.op === 'clip')).toHaveLength(5)
  })

  it('writes the player’s job under each play', () => {
    const playbook = buildPlaybook()
    const surface = new RecordingSurface()
    drawPlayerCardPage(surface, playbook, playerCardPages(playbook).find((p) => p.label === 'RB')!)
    expect(surface.texts()).toContain('No assignment')
    expect(surface.texts()).toContain('Take the handoff from QB · sweep')
  })

  it('carries a card onto more pages when there are more plays than fit', async () => {
    const playbook = buildPlaybook(10)
    const pages = playerCardPages(playbook, { perPage: 8 })
    expect(pages).toHaveLength(14)
    expect(pages.slice(0, 2)).toMatchObject([
      { label: 'QB', page: 1, pages: 2 },
      { label: 'QB', page: 2, pages: 2 },
    ])
    expect(pages[0].plays).toHaveLength(8)
    expect(pages[1].plays).toHaveLength(2)
    expect((await PDFDocument.load(await buildPlayerCardsPdf(playbook, { perPage: 8 }))).getPageCount()).toBe(14)
    // Four per page: 10 plays need 3 pages per position.
    expect(playerCardPages(playbook, { perPage: 4 })).toHaveLength(21)
  })

  it('keeps plays in call-number order', () => {
    const playbook = buildPlaybook(3)
    playbook.plays[0].number = 9
    expect(playerCardPages(playbook)[0].plays.map((p) => p.number)).toEqual([2, 3, 9])
  })

  it('lists positions in lineup order, with relabeled players after', () => {
    const playbook = buildPlaybook(2)
    playbook.plays[1].players = playbook.plays[1].players.map((p) => (p.label === 'W' ? { ...p, label: 'TE' } : p))
    expect(cardLabels(playbook.plays)).toEqual(['QB', 'C', 'RB', 'X', 'Y', 'Z', 'W', 'TE'])
  })

  it('says so when a position is not in a play, and fades everyone', () => {
    const playbook = buildPlaybook(2)
    playbook.plays[1].players = playbook.plays[1].players.map((p) => (p.label === 'RB' ? { ...p, label: 'H' } : p))
    const surface = new RecordingSurface()
    drawPlayerCardPage(surface, playbook, playerCardPages(playbook).find((p) => p.label === 'RB')!)
    expect(surface.texts()).toContain('Not in this play')
  })

  it('still makes cards for an empty playbook', async () => {
    const playbook = { ...buildPlaybook(), plays: [] }
    expect(playerCardPages(playbook)).toEqual([])
    const bytes = await buildPlayerCardsPdf(playbook)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})

describe('a player’s job in words', () => {
  beforeEach(() => {
    buildPlaybook(1)
  })

  it('names a route and its depth, with the read number', () => {
    expect(job('Y')).toBe('In at 5 yd · read 1')
    expect(job('Z')).toBe('Corner at 7 yd · read 2')
  })

  it('starts the center with the snap, and notes a delay', () => {
    expect(job('C')).toBe('Snap, then hitch at 5 yd · delay 1')
    state().clearRoute(idOf('C'))
    expect(job('C')).toBe('Snap')
  })

  it('starts with motion for a player who goes in motion', () => {
    expect(job('X')).toBe('Motion, then slant at 2 yd')
  })

  it('tells the QB to throw, and what to do if blitzed', () => {
    expect(job('QB')).toBe('Throw · if blitzed, roll out')
  })

  it('says when a player has nothing to do', () => {
    expect(job('W')).toBe('No assignment')
  })

  it('covers a handoff from both sides', () => {
    state().setRoute(idOf('RB'), 'sweep')
    state().setHandoff(idOf('QB'), idOf('RB'))
    expect(job('QB')).toBe('Hand off to RB · if blitzed, roll out')
    expect(job('RB')).toBe('Take the handoff from QB · sweep')
  })

  it('describes a run without a handoff, and freehand paths', () => {
    state().setRoute(idOf('RB'), 'dive')
    expect(job('RB')).toBe('Dive')
    state().startFreehand(idOf('W'))
    state().addWaypoint({ x: 16, y: 5 })
    state().stopFreehand()
    expect(job('W')).toBe('Route as drawn')
    state().startFreehand(idOf('RB'), 'run')
    state().addWaypoint({ x: 6, y: 2 })
    state().stopFreehand()
    expect(job('RB')).toBe('Run as drawn')
  })
})
