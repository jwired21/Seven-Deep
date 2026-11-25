import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  fillAndStroke,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setDashPattern,
  setFillingRgbColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
} from '@cantoo/pdf-lib'
import type { Vec } from '../geometry/path'
import { hexToRgb } from './printColor'
import type { Box, ShapeStyle, Stroke, Surface, TextStyle } from './surface'

export type Fonts = { regular: PDFFont; bold: PDFFont }

/** Characters the built-in PDF fonts cannot draw, and what to write instead. */
const REPLACEMENTS: Record<string, string> = { '⅓': ' 1/3', '⅔': ' 2/3', '’': "'", '‘': "'", '“': '"', '”': '"', '−': '-' }

/** How far a Bézier handle sits from its point to approximate a quarter circle. */
const KAPPA = 0.5522847498

/**
 * Draws on a PDF page with plain path operators, so sizes in the file are exactly the sizes
 * asked for. Takes top-left coordinates and flips y, because a PDF's origin is the bottom left.
 */
export class PdfSurface implements Surface {
  private readonly height: number
  private readonly page: PDFPage
  private readonly fonts: Fonts

  constructor(page: PDFPage, fonts: Fonts) {
    this.page = page
    this.fonts = fonts
    this.height = page.getHeight()
  }

  private y(y: number) {
    return this.height - y
  }

  /** Text the font can draw: known substitutions first, then "?" for anything else it lacks. */
  private safe(text: string, font: PDFFont): string {
    const swapped = text.replace(/[⅓⅔’‘“”−]/g, (c) => REPLACEMENTS[c]).replace(/^ /, '')
    let out = ''
    for (const ch of swapped) {
      try {
        font.encodeText(ch)
        out += ch
      } catch {
        out += '?'
      }
    }
    return out
  }

  private strokeOps(s: Stroke): PDFOperator[] {
    const { r, g, b } = hexToRgb(s.color)
    return [
      setStrokingRgbColor(r, g, b),
      setLineWidth(s.width),
      setLineCap(s.cap === 'butt' ? LineCapStyle.Butt : LineCapStyle.Round),
      setLineJoin(LineJoinStyle.Round),
      setDashPattern(s.dash ? [...s.dash] : [], 0),
    ]
  }

  private fillOps(color: string): PDFOperator[] {
    const { r, g, b } = hexToRgb(color)
    return [setFillingRgbColor(r, g, b)]
  }

  /** Wraps a path in its colors and paints it, leaving the page's graphics state as it found it. */
  private paint(path: PDFOperator[], style: ShapeStyle) {
    if (!style.fill && !style.stroke) return
    this.page.pushOperators(
      pushGraphicsState(),
      ...(style.fill ? this.fillOps(style.fill) : []),
      ...(style.stroke ? this.strokeOps(style.stroke) : []),
      ...path,
      style.fill && style.stroke ? fillAndStroke() : style.fill ? fill() : stroke(),
      popGraphicsState(),
    )
  }

  rect(box: Box, style: ShapeStyle) {
    // A PDF rectangle is given by its bottom-left corner.
    this.paint([rectangle(box.x, this.y(box.y + box.height), box.width, box.height)], style)
  }

  private pathOps(points: Vec[]): PDFOperator[] {
    return points.map((p, i) => (i === 0 ? moveTo(p.x, this.y(p.y)) : lineTo(p.x, this.y(p.y))))
  }

  polyline(points: Vec[], strokeStyle: Stroke) {
    if (points.length < 2) return
    this.paint(this.pathOps(points), { stroke: strokeStyle })
  }

  polygon(points: Vec[], style: ShapeStyle) {
    if (points.length < 3) return
    this.paint([...this.pathOps(points), closePath()], style)
  }

  circle(center: Vec, radius: number, style: ShapeStyle) {
    const cx = center.x
    const cy = this.y(center.y)
    const k = radius * KAPPA
    this.paint(
      [
        moveTo(cx + radius, cy),
        appendBezierCurve(cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius),
        appendBezierCurve(cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy),
        appendBezierCurve(cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius),
        appendBezierCurve(cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy),
        closePath(),
      ],
      style,
    )
  }

  textWidth(text: string, size: number, bold = false) {
    const font = bold ? this.fonts.bold : this.fonts.regular
    return font.widthOfTextAtSize(this.safe(text, font), size)
  }

  text(text: string, at: Vec, style: TextStyle) {
    const font = style.bold ? this.fonts.bold : this.fonts.regular
    const safe = this.safe(text, font)
    if (!safe) return
    const width = font.widthOfTextAtSize(safe, style.size)
    const x = style.align === 'center' ? at.x - width / 2 : style.align === 'right' ? at.x - width : at.x
    const { r, g, b } = hexToRgb(style.color)
    this.page.drawText(safe, { x, y: this.y(at.y), size: style.size, font, color: rgb(r, g, b) })
  }

  clip(box: Box, draw: () => void) {
    this.page.pushOperators(
      pushGraphicsState(),
      rectangle(box.x, this.y(box.y + box.height), box.width, box.height),
      clip(),
      endPath(),
    )
    draw()
    this.page.pushOperators(popGraphicsState())
  }
}
