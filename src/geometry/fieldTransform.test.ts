import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../model/defaults'
import { fieldView } from './fieldLayout'
import { createFieldTransform, type FieldView } from './fieldTransform'

// 40 yards wide, 30 yards tall, with the ball 10 yards up from the bottom edge.
const view: FieldView = { xMin: -20, xMax: 20, yMin: -10, yMax: 20 }

describe('yards to pixels', () => {
  it('uses 16 px per yard when a 40 x 30 yd view exactly fills 640 x 480 px', () => {
    const t = createFieldTransform(view, { width: 640, height: 480 })
    expect(t.scale).toBe(16)
    expect(t.len(5)).toBe(80)
    expect(t.viewPx).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('puts the ball, the origin, where the view says it is', () => {
    const t = createFieldTransform(view, { width: 640, height: 480 })
    expect(t.toPx({ x: 0, y: 0 })).toEqual({ x: 320, y: 320 })
  })

  it('draws downfield as up the screen and right as right', () => {
    const t = createFieldTransform(view, { width: 640, height: 480 })
    const ball = t.toPx({ x: 0, y: 0 })
    expect(t.toPx({ x: 0, y: 5 }).y).toBe(ball.y - 80)
    expect(t.toPx({ x: 5, y: 0 }).x).toBe(ball.x + 80)
    expect(t.toPx({ x: -20, y: 20 })).toEqual({ x: 0, y: 0 })
    expect(t.toPx({ x: 20, y: -10 })).toEqual({ x: 640, y: 480 })
  })

  it('one yard is the same number of pixels across and down, at any window shape', () => {
    const sizes = [
      { width: 640, height: 480 },
      { width: 1600, height: 500 },
      { width: 375, height: 700 },
      { width: 123.5, height: 987.25 },
    ]
    for (const size of sizes) {
      const t = createFieldTransform(view, size)
      const a = t.toPx({ x: 0, y: 0 })
      const b = t.toPx({ x: 1, y: 1 })
      expect(b.x - a.x).toBeCloseTo(t.scale, 9)
      expect(a.y - b.y).toBeCloseTo(t.scale, 9)
    }
  })

  it('fits the whole view inside the window and centers it', () => {
    // Wide window: height is the limit, leftover width is split left and right.
    const wide = createFieldTransform(view, { width: 1600, height: 480 })
    expect(wide.scale).toBe(16)
    expect(wide.viewPx).toEqual({ x: 480, y: 0, width: 640, height: 480 })

    // Tall window: width is the limit, leftover height is split top and bottom.
    const tall = createFieldTransform(view, { width: 320, height: 1000 })
    expect(tall.scale).toBe(8)
    expect(tall.viewPx).toEqual({ x: 0, y: 380, width: 320, height: 240 })
  })

  it('honors padding', () => {
    const t = createFieldTransform(view, { width: 660, height: 500 }, 10)
    expect(t.scale).toBe(16)
    expect(t.toPx({ x: -20, y: 20 })).toEqual({ x: 10, y: 10 })
  })

  it('converts pixels back to the same yards', () => {
    const t = createFieldTransform(view, { width: 1013, height: 577 })
    for (const p of [
      { x: 0, y: 0 },
      { x: -17, y: 12 },
      { x: 8.5, y: -3 },
    ]) {
      const back = t.toYd(t.toPx(p))
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.y).toBeCloseTo(p.y, 9)
    }
  })

  it('converts a yard rectangle to a top-left pixel rectangle', () => {
    const t = createFieldTransform(view, { width: 640, height: 480 })
    // A 5-yard band across the field, from 5 to 10 yards downfield.
    expect(t.rectToPx({ x: -20, y: 5, width: 40, height: 5 })).toEqual({
      x: 0,
      y: 160,
      width: 640,
      height: 80,
    })
  })

  it('does not produce NaN before the window has a size', () => {
    const t = createFieldTransform(view, { width: 0, height: 0 })
    expect(t.scale).toBe(0)
    expect(t.toPx({ x: 3, y: 4 })).toEqual({ x: 0, y: 0 })
    expect(t.toYd({ x: 10, y: 10 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps the default 40-yard field 40 yards wide in pixels', () => {
    const v = fieldView(12, DEFAULT_RULES)
    const t = createFieldTransform(v, { width: 900, height: 700 })
    const left = t.toPx({ x: -20, y: 0 })
    const right = t.toPx({ x: 20, y: 0 })
    expect(right.x - left.x).toBeCloseTo(40 * t.scale, 9)
    expect(left.y).toBe(right.y)
  })
})
