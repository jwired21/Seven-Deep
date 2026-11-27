import { describe, expect, it } from 'vitest'
import { fieldView } from '../geometry/fieldLayout'
import { createFieldTransform, type FieldView } from '../geometry/fieldTransform'
import { DEFAULT_BALL_ON, DEFAULT_RULES } from '../model/defaults'
import { fadeTrace, fitTrace, moveTrace, resizeTrace, TRACE_MIN_WIDTH, TRACE_OPACITY, traceMaxWidth, traceRect } from './trace'

const view: FieldView = { xMin: -22, xMax: 22, yMin: -10, yMax: 20 }

describe('fitTrace', () => {
  it('centers a new picture in the view', () => {
    expect(fitTrace(0.5, view).center).toEqual({ x: 0, y: 5 })
  })

  it('fits a wide picture to the width of the view, with a margin', () => {
    // 44 yd across, 30 yd deep. A 2:1 picture is limited by width.
    const { width } = fitTrace(0.5, view)
    expect(width).toBeCloseTo(44 * 0.9)
    expect(width * 0.5).toBeLessThan(30)
  })

  it('fits a tall picture to the depth of the view', () => {
    const { width } = fitTrace(2, view)
    expect(width * 2).toBeCloseTo(30 * 0.9)
  })

  it('fits inside the real field view', () => {
    const real = fieldView(DEFAULT_BALL_ON, DEFAULT_RULES)
    const fit = fitTrace(466 / 826, real)
    const r = traceRect({ aspect: 466 / 826, ...fit })
    expect(r.x).toBeGreaterThanOrEqual(real.xMin)
    expect(r.x + r.width).toBeLessThanOrEqual(real.xMax)
    expect(r.y).toBeGreaterThanOrEqual(real.yMin)
    expect(r.y + r.height).toBeLessThanOrEqual(real.yMax)
  })
})

describe('traceRect', () => {
  it('is centered on the middle and keeps the picture in proportion, in yards', () => {
    expect(traceRect({ center: { x: 2, y: 6 }, width: 20, aspect: 0.5 })).toEqual({ x: -8, y: 1, width: 20, height: 10 })
  })

  it('lands on screen in proportion at any window size', () => {
    const rect = traceRect({ center: { x: 0, y: 5 }, width: 20, aspect: 0.5 })
    for (const size of [{ width: 880, height: 600 }, { width: 375, height: 500 }]) {
      const t = createFieldTransform(view, size)
      const px = t.rectToPx(rect)
      expect(px.height / px.width).toBeCloseTo(0.5)
      expect(px.width).toBeCloseTo(20 * t.scale)
      // The middle of the picture sits on the same yard spot.
      const mid = t.toPx({ x: 0, y: 5 })
      expect(px.x + px.width / 2).toBeCloseTo(mid.x)
      expect(px.y + px.height / 2).toBeCloseTo(mid.y)
    }
  })
})

describe('moveTrace', () => {
  const trace = { center: { x: 0, y: 0 }, width: 20 }

  it('moves the picture in yards', () => {
    expect(moveTrace(trace, { x: 3.5, y: -2.25 }, view).center).toEqual({ x: 3.5, y: -2.25 })
  })

  it('keeps the middle inside the view', () => {
    expect(moveTrace(trace, { x: 500, y: -500 }, view).center).toEqual({ x: 22, y: -10 })
    expect(moveTrace(trace, { x: -500, y: 500 }, view).center).toEqual({ x: -22, y: 20 })
  })

  it('does not change the size', () => {
    expect(moveTrace(trace, { x: 1, y: 1 }, view).width).toBe(20)
  })
})

describe('resizeTrace', () => {
  const trace = { center: { x: 4, y: 3 }, width: 20 }

  it('resizes about the middle', () => {
    const next = resizeTrace(trace, 30, view)
    expect(next.width).toBe(30)
    expect(next.center).toEqual({ x: 4, y: 3 })
  })

  it('stays between the smallest and largest size', () => {
    expect(resizeTrace(trace, 0, view).width).toBe(TRACE_MIN_WIDTH)
    expect(resizeTrace(trace, 9999, view).width).toBe(traceMaxWidth(view))
    expect(traceMaxWidth(view)).toBe(132)
  })
})

describe('fadeTrace', () => {
  it('never lets the picture vanish or go solid', () => {
    expect(fadeTrace({ opacity: 0.5 }, 0).opacity).toBe(TRACE_OPACITY.min)
    expect(fadeTrace({ opacity: 0.5 }, 1).opacity).toBe(TRACE_OPACITY.max)
    expect(fadeTrace({ opacity: 0.5 }, 0.3).opacity).toBe(0.3)
  })
})
