import { useMemo, useState } from 'react'
import { exportFileName } from '../storage/playbookFile'
import { toPlaybook, useEditor } from '../store/editorStore'
import { downloadPdf } from './download'
import { drawPlaybookPage, LETTER, paginate, type PlaybookPdfOptions, type PlaysPerPage } from './playbookPages'
import { SvgSurface } from './svgSurface'

/** Playbook PDF: how many plays per page, paper or field colors, a preview of page one, and the download. */
export function PrintPanel() {
  const plays = useEditor((s) => s.plays)
  const rules = useEditor((s) => s.rules)
  const playbookName = useEditor((s) => s.playbookName)
  const [options, setOptions] = useState<PlaybookPdfOptions>({ perPage: 4, theme: 'paper' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pageCount = paginate(plays, options.perPage).length

  // The preview runs the same drawing code as the PDF, into an SVG instead of a file.
  const preview = useMemo(() => {
    const playbook = toPlaybook(useEditor.getState())
    const pages = paginate(playbook.plays, options.perPage)
    const surface = new SvgSurface('playbook')
    drawPlaybookPage(surface, playbook, pages[0] ?? [], 1, pages.length, options)
    return surface.toSvg(LETTER.width, LETTER.height, `Preview of page 1 of ${pages.length}`)
    // The store values are read through getState; these dependencies say when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plays, rules, playbookName, options])

  const onDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      // Loaded on demand, so the PDF library is not part of the first page load.
      const { buildPlaybookPdf } = await import('./playbookPdf')
      const playbook = toPlaybook(useEditor.getState())
      downloadPdf(exportFileName(playbook.name).replace(/\.json$/, '.pdf'), await buildPlaybookPdf(playbook, options))
    } catch (e) {
      console.error(e)
      setError('The PDF could not be made.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2 className="eyebrow">Playbook PDF</h2>
      <div className="segmented three" role="group" aria-label="Plays per page">
        {([1, 4, 8] as PlaysPerPage[]).map((perPage) => (
          <button
            key={perPage}
            type="button"
            aria-pressed={options.perPage === perPage}
            onClick={() => setOptions({ ...options, perPage })}
          >
            {perPage}
            <small>per page</small>
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Colors">
        <button type="button" aria-pressed={options.theme === 'paper'} onClick={() => setOptions({ ...options, theme: 'paper' })}>
          White paper
        </button>
        <button type="button" aria-pressed={options.theme === 'screen'} onClick={() => setOptions({ ...options, theme: 'screen' })}>
          Green field
        </button>
      </div>

      {/* Our own drawing code made this SVG, and it escapes every piece of text it writes. */}
      <div className="page-preview" dangerouslySetInnerHTML={{ __html: preview }} />
      <p className="muted small">
        Page 1 of {pageCount}. US Letter, {plays.length} play{plays.length === 1 ? '' : 's'}, in call-number order.
      </p>

      <button type="button" className="tool primary" disabled={busy} onClick={onDownload}>
        {busy ? 'Making PDF…' : 'Download playbook PDF'}
      </button>
      {error && <p className="warn small">{error}</p>}
    </section>
  )
}
