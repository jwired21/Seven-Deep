import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { PdfSurface } from './pdfSurface'
import { readPageContent, rectanglesIn } from './readPdf'

/** Draws on a fresh US Letter page and returns the saved file's drawing commands. */
async function draw(fn: (surface: PdfSurface) => void): Promise<string> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  fn(new PdfSurface(page, fonts))
  const [content] = await readPageContent(await pdf.save())
  return content
}

describe('PdfSurface', () => {
  it('writes a rectangle at exactly the size asked for, read back from the file', async () => {
    const content = await draw((s) => s.rect({ x: 72, y: 100, width: 324, height: 162 }, { stroke: { color: '#000000', width: 1 } }))
    expect(rectanglesIn(content, 792)).toEqual([{ x: 72, y: 100, width: 324, height: 162 }])
  })

  it('flips y, because a PDF measures up from the bottom of the page', async () => {
    const content = await draw((s) => s.rect({ x: 0, y: 0, width: 10, height: 20 }, { fill: '#FF0000' }))
    // Top of the page in our coordinates is y = 792 - 20 in the file.
    expect(content).toMatch(/\b0 772 10 20 re\b/)
  })

  it('draws a line through the given points, flipped the same way', async () => {
    const content = await draw((s) =>
      s.polyline(
        [
          { x: 10, y: 10 },
          { x: 110, y: 10 },
          { x: 110, y: 60 },
        ],
        { color: '#000000', width: 2 },
      ),
    )
    expect(content).toMatch(/10 782 m\s+110 782 l\s+110 732 l/)
    expect(content).toMatch(/\b2 w\b/)
  })

  it('sets dashes for a dashed line and none for a solid one', async () => {
    const dashed = await draw((s) => s.polyline([{ x: 0, y: 0 }, { x: 72, y: 0 }], { color: '#000000', width: 1, dash: [3, 5] }))
    expect(dashed).toMatch(/\[\s*3 5\s*\] 0 d/)
    const solid = await draw((s) => s.polyline([{ x: 0, y: 0 }, { x: 72, y: 0 }], { color: '#000000', width: 1 }))
    expect(solid).toMatch(/\[\s*\] 0 d/)
  })

  it('writes colors as red, green, blue from 0 to 1', async () => {
    const content = await draw((s) => s.polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }], { fill: '#FF0000' }))
    expect(content).toMatch(/\b1 0 0 rg\b/)
  })

  it('restores the graphics state after every shape, so one shape cannot leak into the next', async () => {
    const content = await draw((s) => {
      s.rect({ x: 0, y: 0, width: 5, height: 5 }, { fill: '#000000' })
      s.circle({ x: 50, y: 50 }, 10, { stroke: { color: '#000000', width: 1 } })
      s.clip({ x: 0, y: 0, width: 100, height: 100 }, () => s.polyline([{ x: 0, y: 0 }, { x: 9, y: 9 }], { color: '#000000', width: 1 }))
    })
    expect(content.match(/\bq\b/g)!.length).toBe(content.match(/\bQ\b/g)!.length)
    // The clip is a rectangle followed by the clip and end-path operators.
    expect(content).toMatch(/0 692 100 100 re\s+W\s+n/)
  })

  it('swaps characters the built-in font lacks instead of failing', async () => {
    const content = await draw((s) => {
      s.text('3⅓ yd “quoted” 🏈', { x: 10, y: 20 }, { size: 10, color: '#000000' })
      expect(s.textWidth('⅓', 10)).toBeGreaterThan(0)
    })
    expect(content).toContain('Tj')
  })

  it('aligns text by measuring it', async () => {
    const left = await draw((s) => s.text('Hello', { x: 300, y: 100 }, { size: 12, color: '#000000' }))
    const right = await draw((s) => s.text('Hello', { x: 300, y: 100 }, { size: 12, color: '#000000', align: 'right' }))
    const xOf = (content: string) => Number(content.match(/1 0 0 1 ([\d.]+) 692 Tm/)![1])
    expect(xOf(left)).toBe(300)
    expect(xOf(right)).toBeLessThan(300)
  })
})
