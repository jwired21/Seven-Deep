import { PDFDocument } from '@cantoo/pdf-lib'
import { beforeEach, describe, expect, it } from 'vitest'
import { fieldView } from '../geometry/fieldLayout'
import { createFieldTransform } from '../geometry/fieldTransform'
import { POSITION_COLORS } from '../model/players'
import type { Playbook } from '../model/types'
import { resetEditor, toPlaybook, useEditor } from '../store/editorStore'
import { drawPlay, PAPER, SCREEN } from './drawPlay'
import { buildPlaybookPdf, drawPlaybookPage, LETTER, PAGE_MARGIN, paginate, playbookLayout, readOrderText, type PlaysPerPage } from './playbookPdf'
import { blend, contrast, printColor } from './printColor'
import { RecordingSurface } from './surface'
import { SvgSurface } from './svgSurface'

const state = () => useEditor.getState()
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id

/** A playbook of `count` plays. The first has routes, reads, a delay, motion, a handoff, and a QB run. */
function buildPlaybook(count = 1): Playbook {
  resetEditor()
  state().renamePlaybook('Tuesday Night')
  state().renamePlay('Mesh Flood')
  state().setRoute(idOf('Y'), 'in')
  state().setReadOrder(idOf('Y'), 1)
  state().setRoute(idOf('Z'), 'corner')
  state().setReadOrder(idOf('Z'), 2)
  state().setRoute(idOf('C'), 'hitch')
  state().setDelay(idOf('C'), 1)
  state().setRoute(idOf('RB'), 'sweep')
  state().setHandoff(idOf('QB'), idOf('RB'))
  state().setRoute(idOf('QB'), 'roll')
  state().startFreehand(idOf('X'), 'motion')
  state().addWaypoint({ x: -12, y: -2 })
  state().stopFreehand()
  for (let i = 1; i < count; i++) {
    state().newPlay()
    state().renamePlay(`Play ${i + 1}`)
    state().setRoute(idOf('X'), 'go')
  }
  return structuredClone(toPlaybook(state()))
}

const within = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner, slack = 1e-6) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack

beforeEach(resetEditor)

describe('print colors', () => {
  it('darkens colors that are too light for white paper', () => {
    for (const color of [POSITION_COLORS.QB, POSITION_COLORS.Y, POSITION_COLORS.X, POSITION_COLORS.Z]) {
      expect(contrast(color, '#FFFFFF')).toBeLessThan(3)
      expect(contrast(printColor(color), '#FFFFFF')).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every position a line that shows on white paper', () => {
    for (const color of Object.values(POSITION_COLORS)) {
      expect(contrast(printColor(color), '#FFFFFF')).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the hue: yellow prints as gold, not gray', () => {
    const gold = printColor('#FFD23F')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(gold.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b * 2)
  })

  it('darkens no more than it needs to', () => {
    expect(contrast(printColor('#FFFFFF'), '#FFFFFF')).toBeLessThan(3.1)
  })

  it('leaves a color that is already dark enough alone', () => {
    expect(printColor('#1F6FB5')).toBe('#1F6FB5')
    expect(printColor('#000')).toBe('#000000')
  })

  it('blends a see-through color onto a background', () => {
    expect(blend('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(blend('#FF0000', '#FFFFFF', 0)).toBe('#FFFFFF')
  })
})

describe('page layout', () => {
  const printable = { x: PAGE_MARGIN, y: PAGE_MARGIN, width: LETTER.width - PAGE_MARGIN * 2, height: LETTER.height - PAGE_MARGIN * 2 }

  it('is US Letter with half-inch margins', () => {
    expect(LETTER).toEqual({ width: 8.5 * 72, height: 11 * 72 })
    expect(PAGE_MARGIN).toBe(0.5 * 72)
  })

  for (const perPage of [1, 4, 8] as PlaysPerPage[]) {
    it(`fits ${perPage} equal cells inside the margins without overlap`, () => {
      const { cells, header } = playbookLayout(perPage)
      expect(cells).toHaveLength(perPage)
      expect(within(header, printable)).toBe(true)
      for (const cell of cells) {
        expect(within(cell, printable)).toBe(true)
        expect(cell.y).toBeGreaterThan(header.y + header.height)
        expect(cell.width).toBeCloseTo(cells[0].width, 9)
        expect(cell.height).toBeCloseTo(cells[0].height, 9)
      }
      for (const a of cells) {
        for (const b of cells) {
          if (a === b) continue
          const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
          expect(apart).toBe(true)
        }
      }
    })
  }

  it('reads left to right, then top to bottom', () => {
    const { cells } = playbookLayout(4)
    expect(cells[1].x).toBeGreaterThan(cells[0].x)
    expect(cells[1].y).toBe(cells[0].y)
    expect(cells[2].y).toBeGreaterThan(cells[0].y)
  })

  it('splits plays into pages in call-number order', () => {
    const playbook = buildPlaybook(10)
    playbook.plays.reverse()
    const pages = paginate(playbook.plays, 4)
    expect(pages.map((p) => p.length)).toEqual([4, 4, 2])
    expect(pages.flat().map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginate(playbook.plays, 1)).toHaveLength(10)
    expect(paginate(playbook.plays, 8).map((p) => p.length)).toEqual([8, 2])
  })
})

describe('the play diagram', () => {
  const box = { x: 100, y: 200, width: 420, height: 340 }

  it('matches the screen: every player lands at the same spot on the field', () => {
    const [play] = buildPlaybook().plays
    const rules = state().rules
    const surface = new RecordingSurface()
    const drawn = drawPlay(surface, play, rules, box)

    // The designer, at some other size.
    const screen = createFieldTransform(fieldView(play.ballOn, rules), { width: 913, height: 577 })
    for (const player of play.players) {
      const onPaper = drawn.toPt(player.start)
      const onScreen = screen.toPx(player.start)
      // Same position as a fraction of the field, across and down.
      expect((onPaper.x - drawn.field.x) / drawn.field.width).toBeCloseTo((onScreen.x - screen.viewPx.x) / screen.viewPx.width, 9)
      expect((onPaper.y - drawn.field.y) / drawn.field.height).toBeCloseTo((onScreen.y - screen.viewPx.y) / screen.viewPx.height, 9)
    }
  })

  it('draws to scale, with one yard the same length across and down', () => {
    const [play] = buildPlaybook().plays
    const drawn = drawPlay(new RecordingSurface(), play, state().rules, box)
    const a = drawn.toPt({ x: 0, y: 0 })
    const b = drawn.toPt({ x: 1, y: 1 })
    expect(b.x - a.x).toBeCloseTo(drawn.scale, 9)
    expect(a.y - b.y).toBeCloseTo(drawn.scale, 9)
  })

  it('keeps the field inside its box and clips to it', () => {
    const [play] = buildPlaybook().plays
    const surface = new RecordingSurface()
    const drawn = drawPlay(surface, play, state().rules, box)
    expect(within(drawn.field, box)).toBe(true)
    expect(surface.ops[0]).toEqual({ op: 'clip', box: drawn.field })
  })

  it('draws all 7 players, with the center as a square', () => {
    const [play] = buildPlaybook().plays
    const surface = new RecordingSurface()
    const drawn = drawPlay(surface, play, state().rules, box)
    for (const player of play.players) {
      const at = drawn.toPt(player.start)
      const marker = surface.ops.find((o) =>
        player.label === 'C'
          ? o.op === 'rect' && o.style.fill === player.color && Math.abs(o.box.x + o.box.width / 2 - at.x) < 1e-6
          : o.op === 'circle' && o.style.fill === player.color && o.center.x === at.x && o.center.y === at.y,
      )
      expect(marker, player.label).toBeDefined()
    }
    for (const label of ['QB', 'C', 'RB', 'X', 'Y', 'Z', 'W']) expect(surface.texts()).toContain(label)
  })

  it('draws every route with an arrowhead, in color', () => {
    const [play] = buildPlaybook().plays
    const surface = new RecordingSurface()
    drawPlay(surface, play, state().rules, box)
    // Y, Z, C routes, the RB run, and the QB run if blitzed.
    expect(surface.ops.filter((o) => o.op === 'polygon')).toHaveLength(5)
    const lineColors = new Set(surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke.color] : [])))
    expect(lineColors.has(printColor(POSITION_COLORS.Y))).toBe(true)
    expect(lineColors.has(printColor(POSITION_COLORS.Z))).toBe(true)
  })

  it('shows the read numbers, the delay, the handoff, and the QB run', () => {
    const [play] = buildPlaybook().plays
    const surface = new RecordingSurface()
    drawPlay(surface, play, state().rules, box)
    const texts = surface.texts()
    for (const text of ['1', '2', 'delay 1', 'handoff', 'run if blitzed']) expect(texts).toContain(text)
    // The first read is heavier than the second.
    const width = (label: string) =>
      surface.ops.flatMap((o) => (o.op === 'polyline' && o.stroke.color === printColor(POSITION_COLORS[label]) ? [o.stroke.width] : []))[0]
    expect(width('Y')).toBeGreaterThan(width('Z'))
  })

  it('prints light positions darker on paper and keeps screen colors in the screen theme', () => {
    const [play] = buildPlaybook().plays
    const colors = (theme: typeof PAPER) => {
      const surface = new RecordingSurface()
      drawPlay(surface, play, state().rules, box, { theme })
      return new Set(surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke.color] : [])))
    }
    expect(colors(PAPER).has(POSITION_COLORS.Y)).toBe(false)
    expect(colors(SCREEN).has(POSITION_COLORS.Y)).toBe(true)
  })

  it('drops field labels and notes when the diagram is tiny, but keeps the read numbers', () => {
    const [play] = buildPlaybook().plays
    const surface = new RecordingSurface()
    drawPlay(surface, play, state().rules, { x: 0, y: 0, width: 80, height: 70 })
    const texts = surface.texts()
    expect(texts).not.toContain('END ZONE')
    expect(texts).not.toContain('handoff')
    expect(texts).not.toContain('QB')
    expect(texts).toContain('1')
  })
})

describe('the page', () => {
  it('titles each play with its number, name, and formation', () => {
    const playbook = buildPlaybook(3)
    const surface = new RecordingSurface()
    drawPlaybookPage(surface, playbook, paginate(playbook.plays, 4)[0], 1, 1, { perPage: 4, theme: 'paper' })
    const texts = surface.texts()
    expect(texts).toContain('Tuesday Night')
    expect(texts.some((t) => t.includes('Page 1 of 1'))).toBe(true)
    for (const text of ['Mesh Flood', 'Play 2', 'Play 3', 'Spread']) expect(texts).toContain(text)
    expect(texts.some((t) => t.includes('Reads: 1 Y in, 2 Z corner'))).toBe(true)
  })

  it('puts each diagram inside its own cell', () => {
    const playbook = buildPlaybook(8)
    const surface = new RecordingSurface()
    const layout = drawPlaybookPage(surface, playbook, playbook.plays, 1, 1, { perPage: 8, theme: 'paper' })
    const fields = surface.ops.flatMap((o) => (o.op === 'clip' ? [o.box] : []))
    expect(fields).toHaveLength(8)
    fields.forEach((field, i) => expect(within(field, layout.cells[i])).toBe(true))
  })

  it('lists the reads in order', () => {
    expect(readOrderText(buildPlaybook().plays[0])).toBe('1 Y in, 2 Z corner')
    resetEditor()
    expect(readOrderText(state().play)).toBe('')
  })
})

describe('the PDF file', () => {
  for (const perPage of [1, 4, 8] as PlaysPerPage[]) {
    it(`opens, with ${perPage} per page on US Letter`, async () => {
      const playbook = buildPlaybook(9)
      const bytes = await buildPlaybookPdf(playbook, { perPage, theme: 'paper' })
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(Math.ceil(9 / perPage))
      for (const page of pdf.getPages()) {
        expect(page.getWidth()).toBe(612)
        expect(page.getHeight()).toBe(792)
      }
      expect(pdf.getTitle()).toBe('Tuesday Night')
    })
  }

  it('builds in the screen theme too', async () => {
    const bytes = await buildPlaybookPdf(buildPlaybook(2), { perPage: 4, theme: 'screen' })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('copes with names the built-in font cannot draw', async () => {
    const playbook = buildPlaybook()
    playbook.name = 'Coach’s “Best” ⅓ 🏈'
    playbook.plays[0].name = 'Red zone — 3⅓ special ✓'
    playbook.plays[0].ballOn = 10 / 3
    const bytes = await buildPlaybookPdf(playbook, { perPage: 1, theme: 'paper' })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('makes an empty document for an empty playbook without failing', async () => {
    const playbook = { ...buildPlaybook(), plays: [] }
    const bytes = await buildPlaybookPdf(playbook, { perPage: 4, theme: 'paper' })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})

describe('the on-screen preview', () => {
  it('draws the same page as the PDF, as an SVG the size of the paper', () => {
    const playbook = buildPlaybook(3)
    const surface = new SvgSurface()
    drawPlaybookPage(surface, playbook, paginate(playbook.plays, 4)[0], 1, 1, { perPage: 4, theme: 'paper' })
    const svg = surface.toSvg(LETTER.width, LETTER.height, 'Preview')
    expect(svg).toContain('viewBox="0 0 612 792"')
    expect(svg).toContain('>Mesh Flood<')
    expect(svg.match(/<clipPath/g)).toHaveLength(3)
    expect(svg).not.toContain('NaN')
  })

  it('escapes names so they cannot break out of the SVG', () => {
    const playbook = buildPlaybook()
    playbook.plays[0].name = '<script>alert(1)</script> & "more"'
    const surface = new SvgSurface()
    drawPlaybookPage(surface, playbook, playbook.plays, 1, 1, { perPage: 1, theme: 'paper' })
    const svg = surface.toSvg(LETTER.width, LETTER.height, 'A "quoted" label')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('aria-label="A &quot;quoted&quot; label"')
  })
})
