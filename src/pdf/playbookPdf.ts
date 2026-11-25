import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import type { Playbook } from '../model/types'
import { PdfSurface } from './pdfSurface'
import { DEFAULT_CARD_OPTIONS, drawPlayerCardPage, playerCardPages, type PlayerCardOptions } from './playerCards'
import { drawWristCoachSheet, wristCoachSheets } from './wristCoach'
import { DEFAULT_PDF_OPTIONS, drawPlaybookPage, LETTER, paginate, type PlaybookPdfOptions } from './playbookPages'

// The page drawing lives in playbookPages.ts, which has no PDF library in it, so the
// on-screen preview can use it without loading the library. This file is loaded on demand.
export * from './playbookPages'

/** The whole playbook as a PDF file, 1, 4, or 8 plays to a US Letter page, in call-number order. */
export async function buildPlaybookPdf(
  playbook: Playbook,
  options: PlaybookPdfOptions = DEFAULT_PDF_OPTIONS,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(playbook.name || 'Playbook')
  pdf.setCreator('Seven Deep')
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  const pages = paginate(playbook.plays, options.perPage)
  pages.forEach((plays, i) => {
    const page = pdf.addPage([LETTER.width, LETTER.height])
    drawPlaybookPage(new PdfSurface(page, fonts), playbook, plays, i + 1, pages.length, options)
  })
  return pdf.save()
}

/**
 * The wrist coach insert sheets as a PDF: the playbook's plays in call-number order, in
 * windows of the exact size set on the playbook, each with a dashed cut line.
 */
export async function buildWristCoachPdf(playbook: Playbook): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Wrist coach - ${playbook.name || 'Playbook'}`)
  pdf.setCreator('Seven Deep')
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  const sheets = wristCoachSheets(playbook.wristCoach, playbook.plays.length)
  sheets.forEach((sheet, i) => {
    const page = pdf.addPage([LETTER.width, LETTER.height])
    drawWristCoachSheet(new PdfSurface(page, fonts), playbook, sheet, i + 1, sheets.length)
  })
  return pdf.save()
}

/**
 * Every position's card in one PDF: for each player, every play with their own path in
 * color and everyone else faded, plus their job in words.
 */
export async function buildPlayerCardsPdf(
  playbook: Playbook,
  options: PlayerCardOptions = DEFAULT_CARD_OPTIONS,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Player cards - ${playbook.name || 'Playbook'}`)
  pdf.setCreator('Seven Deep')
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  for (const card of playerCardPages(playbook, options)) {
    const page = pdf.addPage([LETTER.width, LETTER.height])
    drawPlayerCardPage(new PdfSurface(page, fonts), playbook, card, options)
  }
  return pdf.save()
}
