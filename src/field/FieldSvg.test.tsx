import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../model/defaults'
import { FieldSvg } from './FieldSvg'

// A round-number field for easy arithmetic: 100 yd long with 10 yd end zones.
const ROUND = { ...DEFAULT_RULES, fieldLength: 100, endZoneDepth: 10 }

const render = (width: number, height: number, ballOn = 12, rules = ROUND) =>
  renderToStaticMarkup(<FieldSvg ballOn={ballOn} rules={rules} width={width} height={height} />)

/** Reads a numeric attribute off the element tagged with data-part. */
function attr(svg: string, part: string, name: string): number {
  const tag = svg.match(new RegExp(`<[a-z]+ data-part="${part}"[^>]*>`))?.[0]
  const value = tag?.match(new RegExp(` ${name}="([^"]+)"`))?.[1]
  if (value === undefined) throw new Error(`no ${name} on ${part}`)
  return Number(value)
}

describe('FieldSvg', () => {
  it('draws every phase 1 marking', () => {
    const svg = render(840, 680)
    for (const part of ['turf', 'end-zone', 'no-run-zone', 'yard-lines', 'goal-line', 'line-of-scrimmage']) {
      expect(svg).toContain(`data-part="${part}"`)
    }
    expect(svg).toContain('NO-RUN ZONE · 3⅓ YD')
    expect(svg).toContain('BALL ON THE 12')
  })

  it('draws to scale: the view is 42 x 34 yd, so 840 x 680 px is 20 px per yard', () => {
    const svg = render(840, 680)
    expect(attr(svg, 'turf', 'width')).toBe(40 * 20)
    expect(attr(svg, 'no-run-zone', 'height')).toBeCloseTo((10 / 3) * 20, 9)
    expect(attr(svg, 'end-zone', 'height')).toBe(10 * 20)
    // Ball is 21 yd from the left edge of the view and 22 yd below its top edge.
    expect(attr(svg, 'ball', 'cx')).toBe(21 * 20)
    expect(attr(svg, 'ball', 'cy')).toBe(22 * 20)
  })

  it('keeps proportions at any window size', () => {
    const sizes = [
      [320, 480],
      [1920, 600],
      [700, 1400],
      [97, 53],
    ]
    for (const [w, h] of sizes) {
      const svg = render(w, h)
      expect(svg).not.toContain('NaN')
      const turfWidth = attr(svg, 'turf', 'width')
      expect(turfWidth).toBeLessThanOrEqual(w)
      expect(attr(svg, 'turf', 'height')).toBeLessThanOrEqual(h + 1e-9)
      // 3⅓-yard zone on a 40-yard field: always one twelfth of the width.
      expect(attr(svg, 'no-run-zone', 'height')).toBeCloseTo(turfWidth / 12, 9)
    }
  })

  it('follows the rules profile and ball spot', () => {
    const svg = render(840, 680, 12, { ...ROUND, noRunZone: 10 })
    expect(svg).toContain('NO-RUN ZONE · 10 YD')
    expect(attr(svg, 'no-run-zone', 'height')).toBe(10 * 20)

    const far = render(840, 680, 40)
    expect(far).not.toContain('data-part="goal-line"')
    expect(far).not.toContain('data-part="no-run-zone"')
  })

  it('draws midfield and the offense’s own end zone when they are in view', () => {
    const mid = render(840, 680, 40)
    expect(mid).toContain('data-part="midfield"')
    expect(mid).toContain('MIDFIELD · FIRST DOWN')

    const backedUp = render(840, 680, 80 - 10 / 3)
    expect(backedUp).toContain('data-part="own-end-zone"')
    expect(backedUp).toContain('data-part="own-goal-line"')
    expect(backedUp).toContain('BALL ON THE 76⅔')
    expect(backedUp).not.toContain('NaN')
  })

  it('draws the league default field without gaps', () => {
    const svg = render(840, 680, 25, DEFAULT_RULES)
    expect(svg).toContain('MIDFIELD · FIRST DOWN')
    expect(svg).toContain('BALL ON THE 25')
    expect(svg).not.toContain('NaN')
  })

  it('renders an empty svg before it has a size', () => {
    const svg = render(0, 0)
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('data-part')
  })
})
