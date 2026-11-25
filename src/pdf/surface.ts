import type { Vec } from '../geometry/path'

/**
 * Something to draw on, in PDF points (1/72 inch) with the origin at the top left and y
 * pointing down, the same way the screen works. The PDF page flips y when it draws.
 *
 * Drawing code talks only to this, so tests can record what was drawn and check sizes
 * without a PDF library, and the screen and the PDF share their geometry.
 */
export type Stroke = {
  color: string
  width: number
  dash?: [number, number] | null
  /** Round by default. 'butt' ends the line exactly at its last point, for cut lines and rulers. */
  cap?: 'round' | 'butt'
}
export type ShapeStyle = { fill?: string; stroke?: Stroke }
export type TextStyle = { size: number; color: string; bold?: boolean; align?: 'left' | 'center' | 'right' }
export type Box = { x: number; y: number; width: number; height: number }

export interface Surface {
  rect(box: Box, style: ShapeStyle): void
  /** An open line through the points, with round ends and corners. */
  polyline(points: Vec[], stroke: Stroke): void
  /** A closed, filled shape. */
  polygon(points: Vec[], style: ShapeStyle): void
  circle(center: Vec, radius: number, style: ShapeStyle): void
  /** Text with its baseline at `at.y`. `align` says which part of the text sits on `at.x`. */
  text(text: string, at: Vec, style: TextStyle): void
  textWidth(text: string, size: number, bold?: boolean): number
  /** Runs `draw` with everything outside the box cut off. */
  clip(box: Box, draw: () => void): void
}

export type Recorded =
  | { op: 'rect'; box: Box; style: ShapeStyle }
  | { op: 'polyline'; points: Vec[]; stroke: Stroke }
  | { op: 'polygon'; points: Vec[]; style: ShapeStyle }
  | { op: 'circle'; center: Vec; radius: number; style: ShapeStyle }
  | { op: 'text'; text: string; at: Vec; style: TextStyle }
  | { op: 'clip'; box: Box }

/** A surface that draws nothing and remembers everything, for tests. */
export class RecordingSurface implements Surface {
  ops: Recorded[] = []

  rect(box: Box, style: ShapeStyle) {
    this.ops.push({ op: 'rect', box, style })
  }
  polyline(points: Vec[], stroke: Stroke) {
    this.ops.push({ op: 'polyline', points, stroke })
  }
  polygon(points: Vec[], style: ShapeStyle) {
    this.ops.push({ op: 'polygon', points, style })
  }
  circle(center: Vec, radius: number, style: ShapeStyle) {
    this.ops.push({ op: 'circle', center, radius, style })
  }
  text(text: string, at: Vec, style: TextStyle) {
    this.ops.push({ op: 'text', text, at, style })
  }
  /** A rough width, half the size per character, which is close enough for layout tests. */
  textWidth(text: string, size: number) {
    return text.length * size * 0.5
  }
  clip(box: Box, draw: () => void) {
    this.ops.push({ op: 'clip', box })
    draw()
  }

  texts() {
    return this.ops.flatMap((o) => (o.op === 'text' ? [o.text] : []))
  }
}
