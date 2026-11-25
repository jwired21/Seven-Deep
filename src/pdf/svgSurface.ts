import type { Vec } from '../geometry/path'
import type { Box, ShapeStyle, Stroke, Surface, TextStyle } from './surface'

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const n = (value: number) => String(Math.round(value * 1000) / 1000)

/**
 * Draws the same calls as the PDF into an SVG string, for the on-screen print preview.
 * One unit is one point, so the preview has the proportions of the printed page.
 * Text is set in the browser's Helvetica or Arial, so line breaks can differ by a hair from the PDF.
 */
export class SvgSurface implements Surface {
  private parts: string[] = []
  private clips = 0
  private readonly idPrefix: string

  constructor(idPrefix = 'preview') {
    this.idPrefix = idPrefix
  }

  private paint(style: ShapeStyle): string {
    const s = style.stroke
    return [
      `fill="${style.fill ?? 'none'}"`,
      s && `stroke="${s.color}" stroke-width="${n(s.width)}" stroke-linecap="${s.cap ?? 'round'}" stroke-linejoin="round"`,
      s?.dash && `stroke-dasharray="${s.dash.map(n).join(' ')}"`,
    ]
      .filter(Boolean)
      .join(' ')
  }

  rect(box: Box, style: ShapeStyle) {
    this.parts.push(`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" ${this.paint(style)}/>`)
  }

  polyline(points: Vec[], stroke: Stroke) {
    if (points.length < 2) return
    this.parts.push(`<polyline points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" ${this.paint({ stroke })}/>`)
  }

  polygon(points: Vec[], style: ShapeStyle) {
    if (points.length < 3) return
    this.parts.push(`<polygon points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" ${this.paint(style)}/>`)
  }

  circle(center: Vec, radius: number, style: ShapeStyle) {
    this.parts.push(`<circle cx="${n(center.x)}" cy="${n(center.y)}" r="${n(radius)}" ${this.paint(style)}/>`)
  }

  /** Helvetica averages about half its size per character, a little more in bold. */
  textWidth(text: string, size: number, bold = false) {
    return text.length * size * (bold ? 0.56 : 0.5)
  }

  text(text: string, at: Vec, style: TextStyle) {
    const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start'
    this.parts.push(
      `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${n(style.size)}" fill="${style.color}" text-anchor="${anchor}"${style.bold ? ' font-weight="700"' : ''}>${escape(text)}</text>`,
    )
  }

  clip(box: Box, draw: () => void) {
    const id = `${this.idPrefix}-clip-${this.clips++}`
    this.parts.push(
      `<clipPath id="${id}"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}"/></clipPath><g clip-path="url(#${id})">`,
    )
    draw()
    this.parts.push('</g>')
  }

  /** The finished page as an SVG document on white paper. */
  toSvg(width: number, height: number, label: string): string {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}" ` +
      `font-family="Helvetica, Arial, sans-serif"><rect width="${width}" height="${height}" fill="#FFFFFF"/>${this.parts.join('')}</svg>`
    )
  }
}
