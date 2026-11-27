import type { FieldView, RectYd } from '../geometry/fieldTransform'
import type { Point, Yd } from '../model/types'

/**
 * A picture laid on the field to trace over: a screenshot of a play from somewhere else.
 * It is placed and sized in yards, like everything else on the field, so it stays put
 * under the players at any window size. It is a tracing aid, not part of the play: it is
 * never saved, exported, or printed.
 */
export type Trace = {
  /** Where the browser can load the picture from. */
  src: string
  /** Height divided by width, so the picture is never stretched. */
  aspect: number
  /** The middle of the picture, in field yards. */
  center: Point
  /** How wide the picture is drawn, in yards. */
  width: Yd
  /** 0 is invisible, 1 is solid. */
  opacity: number
}

export const TRACE_OPACITY = { min: 0.15, max: 0.9, initial: 0.5 }

/** The narrowest a picture can be made, in yards. */
export const TRACE_MIN_WIDTH: Yd = 5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The widest a picture can be made: three times the view, enough to zoom in on one side of a play. */
export const traceMaxWidth = (view: FieldView): Yd => (view.xMax - view.xMin) * 3

/** Where a new picture starts: centered in the view and as large as fits inside it with a small margin. */
export function fitTrace(aspect: number, view: FieldView): { center: Point; width: Yd } {
  const viewW = view.xMax - view.xMin
  const viewH = view.yMax - view.yMin
  const width = Math.min(viewW, viewH / aspect) * 0.9
  return {
    center: { x: (view.xMin + view.xMax) / 2, y: (view.yMin + view.yMax) / 2 },
    width: clamp(width, TRACE_MIN_WIDTH, traceMaxWidth(view)),
  }
}

/** The picture's rectangle on the field, in yards. */
export function traceRect(trace: Pick<Trace, 'aspect' | 'center' | 'width'>): RectYd {
  const height = trace.width * trace.aspect
  return { x: trace.center.x - trace.width / 2, y: trace.center.y - height / 2, width: trace.width, height }
}

/** Moves the picture. Its middle stays inside the view, so it can never be dragged out of reach. */
export function moveTrace<T extends Pick<Trace, 'center'>>(trace: T, center: Point, view: FieldView): T {
  return {
    ...trace,
    center: { x: clamp(center.x, view.xMin, view.xMax), y: clamp(center.y, view.yMin, view.yMax) },
  }
}

/** Resizes the picture about its middle. */
export function resizeTrace<T extends Pick<Trace, 'width'>>(trace: T, width: Yd, view: FieldView): T {
  return { ...trace, width: clamp(width, TRACE_MIN_WIDTH, traceMaxWidth(view)) }
}

export function fadeTrace<T extends Pick<Trace, 'opacity'>>(trace: T, opacity: number): T {
  return { ...trace, opacity: clamp(opacity, TRACE_OPACITY.min, TRACE_OPACITY.max) }
}
