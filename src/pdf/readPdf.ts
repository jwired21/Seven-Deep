import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from '@cantoo/pdf-lib'
import type { Box } from './surface'

/**
 * Reads a generated PDF back, for tests that prove physical sizes.
 * Returns each page's drawing commands as text.
 */
export async function readPageContent(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents]
    return streams
      .map((stream) => (stream instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode()) : ''))
      .join('\n')
  })
}

const NUM = '(-?[\\d.]+)'
const toBox = (match: RegExpMatchArray, pageHeight: number): Box => {
  const [x, y, width, height] = match.slice(1).map(Number)
  return { x, y: pageHeight - y - height, width, height }
}

/**
 * Every rectangle drawn on a page, converted back to top-left coordinates in points.
 * A PDF rectangle is "x y width height re", measured from the bottom left.
 */
export function rectanglesIn(content: string, pageHeight: number): Box[] {
  const pattern = new RegExp(`${NUM} ${NUM} ${NUM} ${NUM} re\\b`, 'g')
  return [...content.matchAll(pattern)].map((m) => toBox(m, pageHeight))
}

/**
 * Every dashed, stroked rectangle on a page: the cut lines of a wrist coach sheet.
 * Nothing else on a sheet is a dashed rectangle. In the file, the dash pattern is set
 * right before the rectangle, and "S" strokes it.
 */
export function dashedRectanglesIn(content: string, pageHeight: number): Box[] {
  const pattern = new RegExp(`\\[\\s*[\\d.]+ [\\d.]+\\s*\\] 0 d\\s+${NUM} ${NUM} ${NUM} ${NUM} re\\s+S\\b`, 'g')
  return [...content.matchAll(pattern)].map((m) => toBox(m, pageHeight))
}

/** Every straight, two-point stroked line on a page, in top-left coordinates. */
export function linesIn(content: string, pageHeight: number): { x1: number; y1: number; x2: number; y2: number }[] {
  const pattern = new RegExp(`${NUM} ${NUM} m\\s+${NUM} ${NUM} l\\s+S\\b`, 'g')
  return [...content.matchAll(pattern)].map((m) => {
    const [x1, y1, x2, y2] = m.slice(1).map(Number)
    return { x1, y1: pageHeight - y1, x2, y2: pageHeight - y2 }
  })
}
