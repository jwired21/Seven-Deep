import { PDFDocument } from '@cantoo/pdf-lib'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_WRIST_COACH } from '../model/defaults'
import { POSITION_COLORS } from '../model/players'
import type { Playbook, WristCoachLayout } from '../model/types'
import { resetEditor, toPlaybook, useEditor } from '../store/editorStore'
import { parsePlaybook } from '../storage/playbookFile'
import { LETTER, PAGE_MARGIN } from './playbookPages'
import { buildWristCoachPdf } from './playbookPdf'
import { printColor } from './printColor'
import { dashedRectanglesIn, linesIn, readPageContent } from './readPdf'
import { RecordingSurface, type Box } from './surface'
import { compactView, drawWristCoachSheet, PRINT_NOTICE, sanitizeWristCoach, windowCells, wristCoachSheets } from './wristCoach'

const state = () => useEditor.getState()
const idOf = (label: string) => state().play.players.find((p) => p.label === label)!.id

/** A playbook of `count` plays, each with a couple of routes and a first read. */
function buildPlaybook(count: number, wristCoach: Partial<WristCoachLayout> = {}): Playbook {
  resetEditor()
  state().renamePlaybook('Tuesday Night')
  for (let i = 0; i < count; i++) {
    if (i > 0) state().newPlay()
    state().renamePlay(`Play ${i + 1}`)
    state().setRoute(idOf('Y'), 'in')
    state().setReadOrder(idOf('Y'), 1)
    state().setRoute(idOf('Z'), 'corner')
    state().setRoute(idOf('RB'), 'wheel')
  }
  state().setWristCoach(wristCoach)
  return structuredClone(toPlaybook(state()))
}

/** Reads every cut rectangle and the calibration bracket back out of a generated PDF. */
async function measure(playbook: Playbook) {
  const bytes = await buildWristCoachPdf(playbook)
  const pages = await readPageContent(bytes)
  const sheets = wristCoachSheets(playbook.wristCoach, playbook.plays.length)
  return pages.map((content, i) => {
    const bracketY = sheets[i].calibration.y
    const bracket = linesIn(content, LETTER.height).filter((l) => Math.abs(l.y1 - bracketY) < 0.01 && Math.abs(l.y2 - bracketY) < 0.01)
    return { cuts: dashedRectanglesIn(content, LETTER.height), bracket }
  })
}

const within = (inner: Box, outer: Box, slack = 1e-6) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack

const printable: Box = { x: PAGE_MARGIN, y: PAGE_MARGIN, width: LETTER.width - PAGE_MARGIN * 2, height: LETTER.height - PAGE_MARGIN * 2 }

beforeEach(resetEditor)

describe('the test that proves it: sizes read back from the PDF', () => {
  it('cuts each default window at 324 x 162 pt, which is 4.5 x 2.25 in', async () => {
    const [sheet, ...more] = await measure(buildPlaybook(20))
    expect(more).toHaveLength(0)
    expect(sheet.cuts).toHaveLength(3)
    for (const cut of sheet.cuts) {
      expect(Math.abs(cut.width - 324)).toBeLessThan(0.5)
      expect(Math.abs(cut.height - 162)).toBeLessThan(0.5)
    }
  })

  it('cuts a custom 5 x 3 in window at 360 x 216 pt', async () => {
    const sheets = await measure(buildPlaybook(20, { windowWidthIn: 5, windowHeightIn: 3 }))
    const cuts = sheets.flatMap((s) => s.cuts)
    expect(cuts).toHaveLength(3)
    for (const cut of cuts) {
      expect(Math.abs(cut.width - 360)).toBeLessThan(0.5)
      expect(Math.abs(cut.height - 216)).toBeLessThan(0.5)
    }
  })

  it('draws a 72 pt, 1-inch calibration bracket on every sheet', async () => {
    // 5 x 3 in windows do not all fit on one page, so this checks more than one sheet.
    const sheets = await measure(buildPlaybook(20, { windowWidthIn: 5, windowHeightIn: 3 }))
    expect(sheets.length).toBeGreaterThan(1)
    for (const sheet of sheets) {
      expect(sheet.bracket).toHaveLength(1)
      const [line] = sheet.bracket
      expect(Math.abs(Math.abs(line.x2 - line.x1) - 72)).toBeLessThan(0.5)
    }
  })

  it('holds for other sizes too', async () => {
    for (const [w, h] of [[3.5, 2], [4.75, 2.5], [7.5, 4]]) {
      const sheets = await measure(buildPlaybook(6, { windowWidthIn: w, windowHeightIn: h, windows: 2 }))
      const cuts = sheets.flatMap((s) => s.cuts)
      expect(cuts).toHaveLength(2)
      for (const cut of cuts) {
        expect(Math.abs(cut.width - w * 72)).toBeLessThan(0.5)
        expect(Math.abs(cut.height - h * 72)).toBeLessThan(0.5)
      }
    }
  })

  it('makes US Letter pages that open', async () => {
    const bytes = await buildWristCoachPdf(buildPlaybook(20))
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getWidth()).toBe(612)
    expect(pdf.getPage(0).getHeight()).toBe(792)
  })
})

describe('sheet layout', () => {
  it('stacks the default band of 3 windows down the page inside the margins', () => {
    const [sheet] = wristCoachSheets(DEFAULT_WRIST_COACH, 24)
    expect(sheet.windows.map((w) => w.number)).toEqual([1, 2, 3])
    sheet.windows.forEach((w, i) => {
      expect(w.box.width).toBe(324)
      expect(w.box.height).toBe(162)
      expect(within(w.box, printable)).toBe(true)
      if (i > 0) expect(w.box.y).toBeGreaterThan(sheet.windows[i - 1].box.y + 162)
    })
  })

  it('puts the call key beside the windows without touching them', () => {
    const [sheet] = wristCoachSheets(DEFAULT_WRIST_COACH, 24)
    expect(sheet.key.columns).toBe(1)
    expect(sheet.key.x).toBeGreaterThan(sheet.windows[0].box.x + 324)
    expect(within(sheet.key, printable)).toBe(true)
  })

  it('moves the call key below when the windows are too wide to sit beside it', () => {
    const [sheet] = wristCoachSheets({ ...DEFAULT_WRIST_COACH, windowWidthIn: 7 }, 24)
    const last = sheet.windows.at(-1)!.box
    expect(sheet.key.columns).toBe(3)
    expect(sheet.key.y).toBeGreaterThan(last.y + last.height)
    expect(within(sheet.key, printable)).toBe(true)
  })

  it('carries windows that do not fit onto more sheets, never off the page', () => {
    const sheets = wristCoachSheets({ ...DEFAULT_WRIST_COACH, windowHeightIn: 4, windows: 5 }, 0)
    expect(sheets.length).toBeGreaterThan(1)
    expect(sheets.flatMap((s) => s.windows).map((w) => w.number)).toEqual([1, 2, 3, 4, 5])
    for (const sheet of sheets) for (const w of sheet.windows) expect(within(w.box, printable)).toBe(true)
  })

  it('adds windows when the playbook has more plays than the band holds', () => {
    // 3 windows of 8 hold 24. 30 plays need a fourth.
    const sheets = wristCoachSheets(DEFAULT_WRIST_COACH, 30)
    const windows = sheets.flatMap((s) => s.windows)
    expect(windows).toHaveLength(4)
    expect(windows.map((w) => w.firstPlay)).toEqual([0, 8, 16, 24])
  })

  it('keeps the band’s windows even when there are few plays, so blanks can be cut too', () => {
    expect(wristCoachSheets(DEFAULT_WRIST_COACH, 2)[0].windows).toHaveLength(3)
  })

  it('puts the calibration bracket above the first window', () => {
    const [sheet] = wristCoachSheets(DEFAULT_WRIST_COACH, 8)
    expect(sheet.calibration.length).toBe(72)
    expect(sheet.calibration.y).toBeLessThan(sheet.windows[0].box.y)
  })
})

describe('cells in a window', () => {
  const window: Box = { x: 36, y: 100, width: 324, height: 162 }

  it('defaults to 8 plays, 4 across by 2 down', () => {
    const cells = windowCells(window, 8)
    expect(cells).toHaveLength(8)
    expect(new Set(cells.map((c) => c.x)).size).toBe(4)
    expect(new Set(cells.map((c) => c.y)).size).toBe(2)
  })

  for (const [plays, columns, rows] of [[4, 2, 2], [6, 3, 2], [8, 4, 2], [12, 4, 3]] as const) {
    it(`fits ${plays} equal cells inside the cut line`, () => {
      const cells = windowCells(window, plays)
      expect(cells).toHaveLength(plays)
      expect(new Set(cells.map((c) => c.x)).size).toBe(columns)
      expect(new Set(cells.map((c) => c.y)).size).toBe(rows)
      for (const cell of cells) {
        expect(within(cell, window)).toBe(true)
        expect(cell.x).toBeGreaterThan(window.x)
        expect(cell.width).toBeCloseTo(cells[0].width, 9)
      }
    })
  }
})

describe('what is on the sheet', () => {
  const draw = (playbook: Playbook) => {
    const surface = new RecordingSurface()
    const sheets = wristCoachSheets(playbook.wristCoach, playbook.plays.length)
    drawWristCoachSheet(surface, playbook, sheets[0], 1, sheets.length)
    return { surface, sheet: sheets[0] }
  }

  it('says "Print at 100%. Do not fit to page."', () => {
    expect(PRINT_NOTICE).toBe('Print at 100%. Do not fit to page.')
    expect(draw(buildPlaybook(3)).surface.texts()).toContain(PRINT_NOTICE)
  })

  it('labels the calibration bracket as 1 inch', () => {
    expect(draw(buildPlaybook(3)).surface.texts().some((t) => t.startsWith('1 inch.'))).toBe(true)
  })

  it('shows each play’s call number in bold, its name, and a diagram', () => {
    const { surface } = draw(buildPlaybook(5))
    for (let n = 1; n <= 5; n++) {
      const number = surface.ops.find((o) => o.op === 'text' && o.text === String(n) && o.style.bold)
      expect(number, `number ${n}`).toBeDefined()
      expect(surface.texts()).toContain(`Play ${n}`)
    }
    // One clipped diagram per play.
    expect(surface.ops.filter((o) => o.op === 'clip')).toHaveLength(5)
  })

  it('keeps every diagram inside its own cell and its window', () => {
    const playbook = buildPlaybook(20)
    const { surface, sheet } = draw(playbook)
    const diagrams = surface.ops.flatMap((o) => (o.op === 'clip' ? [o.box] : []))
    expect(diagrams).toHaveLength(20)
    diagrams.forEach((box, i) => {
      const window = sheet.windows[Math.floor(i / 8)]
      const cell = windowCells(window.box, 8)[i % 8]
      expect(within(box, cell)).toBe(true)
    })
  })

  it('draws a dashed cut line exactly on each window', () => {
    const { surface, sheet } = draw(buildPlaybook(3))
    const cuts = surface.ops.filter((o) => o.op === 'rect' && o.style.stroke?.dash)
    expect(cuts.map((c) => (c.op === 'rect' ? c.box : null))).toEqual(sheet.windows.map((w) => w.box))
  })

  it('lists every number and name in the call key, by window', () => {
    const { surface } = draw(buildPlaybook(10))
    const texts = surface.texts()
    expect(texts).toContain('CALL KEY')
    for (const text of ['Window 1', 'Window 2', 'Window 3', '1  Play 1', '9  Play 9', '10  Play 10', 'empty']) {
      expect(texts).toContain(text)
    }
  })

  it('orders plays by call number, whatever order they were made in', () => {
    const playbook = buildPlaybook(3)
    playbook.plays[0].number = 9
    const { surface } = draw(playbook)
    const key = surface.texts().filter((t) => /^\d+  Play/.test(t))
    expect(key).toEqual(['2  Play 2', '3  Play 3', '9  Play 1'])
  })

  it('uses one print color per position and a thicker line for the first read', () => {
    const { surface } = draw(buildPlaybook(1))
    const lines = surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke] : []))
    const y = lines.find((s) => s.color === printColor(POSITION_COLORS.Y))!
    const z = lines.find((s) => s.color === printColor(POSITION_COLORS.Z))!
    expect(y).toBeDefined()
    expect(z).toBeDefined()
    // Y is the first read.
    expect(y.width).toBeGreaterThan(z.width)
    // Yellow is too light for paper, so it is not printed as is.
    expect(lines.some((s) => s.color === POSITION_COLORS.Y)).toBe(false)
  })

  it('prints in black and white when color is off', () => {
    const { surface } = draw(buildPlaybook(1, { color: false }))
    const routeColors = Object.values(POSITION_COLORS).map((c) => printColor(c))
    const used = surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke.color] : o.op === 'polygon' ? [o.style.fill] : []))
    expect(used.some((c) => c !== '#1A1A1A' && routeColors.includes(c ?? '') && c !== printColor('#FFFFFF'))).toBe(false)
    expect(used).toContain('#1A1A1A')
  })

  it('makes a player sheet: that player in color, everyone else faded', () => {
    const { surface } = draw(buildPlaybook(1, { mode: 'player', playerLabel: 'Z' }))
    const used = new Set(surface.ops.flatMap((o) => (o.op === 'polyline' ? [o.stroke.color] : [])))
    expect(used.has(printColor(POSITION_COLORS.Z))).toBe(true)
    expect(used.has(printColor(POSITION_COLORS.Y))).toBe(false)
    expect(surface.texts().some((t) => t.includes('Player sheet: Z'))).toBe(true)
  })

  it('draws lines no thinner than 0.7 pt and markers no smaller than 2 pt, so a tiny diagram still prints', () => {
    const { surface } = draw(buildPlaybook(12, { playsPerWindow: 12 }))
    const routes = surface.ops.flatMap((o) => (o.op === 'polyline' && o.stroke.color === printColor(POSITION_COLORS.Z) ? [o.stroke.width] : []))
    expect(Math.min(...routes)).toBeGreaterThanOrEqual(0.7)
    const markers = surface.ops.flatMap((o) => (o.op === 'circle' && o.style.fill === POSITION_COLORS.Z ? [o.radius] : []))
    expect(Math.min(...markers)).toBeGreaterThanOrEqual(2)
  })
})

describe('the cropped mini-diagram view', () => {
  it('shows the full width and only as much depth as the play uses', () => {
    const playbook = buildPlaybook(1)
    const view = compactView(playbook.plays[0], playbook.rules)
    expect(view.xMin).toBeLessThan(-20)
    expect(view.xMax).toBeGreaterThan(20)
    // The deepest player is the QB at -5, and the wheel goes 12 past the line.
    expect(view.yMin).toBe(-7)
    expect(view.yMax).toBe(14)
  })

  it('still shows some field ahead on a play with no routes', () => {
    resetEditor()
    const view = compactView(state().play, state().rules)
    expect(view.yMax).toBe(8)
  })
})

describe('settings', () => {
  it('defaults to 4.5 x 2.25 in, 3 windows, 8 plays, QB sheet, in color', () => {
    expect(DEFAULT_WRIST_COACH).toMatchObject({ windowWidthIn: 4.5, windowHeightIn: 2.25, windows: 3, playsPerWindow: 8, mode: 'qb', color: true })
  })

  it('keeps settings printable', () => {
    const wild = sanitizeWristCoach({ ...DEFAULT_WRIST_COACH, windowWidthIn: 40, windowHeightIn: 0.1, windows: 0, playsPerWindow: 5 as 4 })
    expect(wild).toMatchObject({ windowWidthIn: 7.5, windowHeightIn: 1, windows: 1, playsPerWindow: 8 })
    expect(sanitizeWristCoach({ ...DEFAULT_WRIST_COACH, windowWidthIn: Number.NaN }).windowWidthIn).toBe(4.5)
  })

  it('changes through the store, without an undo step, and saves with the playbook', () => {
    state().setWristCoach({ windowWidthIn: 5, windowHeightIn: 3, playsPerWindow: 6 })
    expect(state().wristCoach).toMatchObject({ windowWidthIn: 5, windowHeightIn: 3, playsPerWindow: 6 })
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
    const saved = parsePlaybook(structuredClone(toPlaybook(state())))
    expect(saved.wristCoach).toEqual(state().wristCoach)
  })

  it('round-trips a player sheet setting through the file format', () => {
    state().setWristCoach({ mode: 'player', playerLabel: 'RB', color: false })
    const saved = parsePlaybook(structuredClone(toPlaybook(state())))
    expect(saved.wristCoach).toMatchObject({ mode: 'player', playerLabel: 'RB', color: false })
  })
})
