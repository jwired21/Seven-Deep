import type { Point, Yd } from '../model/types'

/** The window of the field being drawn, in yards. */
export type FieldView = { xMin: Yd; xMax: Yd; yMin: Yd; yMax: Yd }

/** A rectangle in yards. (x, y) is the corner nearest the left sideline and furthest from the goal line. */
export type RectYd = { x: Yd; y: Yd; width: Yd; height: Yd }

export type Px = number
export type PointPx = { x: Px; y: Px }
export type SizePx = { width: Px; height: Px }
/** A rectangle in pixels. (x, y) is the top-left corner, as SVG expects. */
export type RectPx = { x: Px; y: Px; width: Px; height: Px }

export type FieldTransform = {
  /** Pixels per yard. The same on both axes, so the field is never stretched. */
  scale: number
  /** Where the view lands inside the drawing area, centered. */
  viewPx: RectPx
  toPx(p: Point): PointPx
  toYd(p: PointPx): Point
  /** A length in yards, as pixels. */
  len(yd: Yd): Px
  rectToPx(r: RectYd): RectPx
}

/**
 * Builds the one conversion between yards and pixels.
 *
 * The view is scaled uniformly to fit the drawing area and centered in it.
 * Downfield (+y in yards) is up on screen, so the y axis flips.
 */
export function createFieldTransform(view: FieldView, size: SizePx, padding: Px = 0): FieldTransform {
  const viewW = view.xMax - view.xMin
  const viewH = view.yMax - view.yMin
  const availW = Math.max(0, size.width - padding * 2)
  const availH = Math.max(0, size.height - padding * 2)

  const scale = viewW > 0 && viewH > 0 ? Math.min(availW / viewW, availH / viewH) : 0

  const viewPx: RectPx = {
    x: (size.width - viewW * scale) / 2,
    y: (size.height - viewH * scale) / 2,
    width: viewW * scale,
    height: viewH * scale,
  }

  const toPx = (p: Point): PointPx => ({
    x: viewPx.x + (p.x - view.xMin) * scale,
    y: viewPx.y + (view.yMax - p.y) * scale,
  })

  const toYd = (p: PointPx): Point =>
    scale === 0
      ? { x: 0, y: 0 }
      : {
          x: view.xMin + (p.x - viewPx.x) / scale,
          y: view.yMax - (p.y - viewPx.y) / scale,
        }

  const len = (yd: Yd): Px => yd * scale

  const rectToPx = (r: RectYd): RectPx => {
    const topLeft = toPx({ x: r.x, y: r.y + r.height })
    return { x: topLeft.x, y: topLeft.y, width: r.width * scale, height: r.height * scale }
  }

  return { scale, viewPx, toPx, toYd, len, rectToPx }
}
