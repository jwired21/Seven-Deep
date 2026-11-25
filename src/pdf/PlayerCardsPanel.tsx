import { useMemo, useState } from 'react'
import { exportFileName } from '../storage/playbookFile'
import { toPlaybook, useEditor } from '../store/editorStore'
import { downloadPdf } from './download'
import { cardLabels, drawPlayerCardPage, playerCardPages, type CardPlaysPerPage, type PlayerCardOptions } from './playerCards'
import { LETTER } from './playbookPages'
import { SvgSurface } from './svgSurface'

/** Player cards: one card per position, with a preview of any position's card, and the download. */
export function PlayerCardsPanel() {
  const plays = useEditor((s) => s.plays)
  const rules = useEditor((s) => s.rules)
  const playbookName = useEditor((s) => s.playbookName)
  const [options, setOptions] = useState<PlayerCardOptions>({ perPage: 8 })
  const [shown, setShown] = useState('QB')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labels = cardLabels(plays)
  const label = labels.includes(shown) ? shown : (labels[0] ?? 'QB')
  const pages = playerCardPages(toPlaybook(useEditor.getState()), options)

  // The preview runs the same drawing code as the PDF, into an SVG instead of a file.
  const preview = useMemo(() => {
    const playbook = toPlaybook(useEditor.getState())
    const card = playerCardPages(playbook, options).find((p) => p.label === label)
    const surface = new SvgSurface('cards')
    if (card) drawPlayerCardPage(surface, playbook, card, options)
    return surface.toSvg(LETTER.width, LETTER.height, `Preview of the ${label} card`)
    // The store values are read through getState; these dependencies say when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plays, rules, playbookName, options, label])

  const onDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      const { buildPlayerCardsPdf } = await import('./playbookPdf')
      const playbook = toPlaybook(useEditor.getState())
      const name = exportFileName(`${playbook.name} player cards`).replace(/\.json$/, '.pdf')
      downloadPdf(name, await buildPlayerCardsPdf(playbook, options))
    } catch (e) {
      console.error(e)
      setError('The PDF could not be made.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2 className="eyebrow">Player cards</h2>
      <div className="segmented" role="group" aria-label="Plays per page">
        {([4, 8] as CardPlaysPerPage[]).map((perPage) => (
          <button key={perPage} type="button" aria-pressed={options.perPage === perPage} onClick={() => setOptions({ perPage })}>
            {perPage}
            <small>per page</small>
          </button>
        ))}
      </div>

      <div className="chips" role="group" aria-label="Card to preview">
        {labels.map((l) => (
          <button key={l} type="button" className="chip-button" aria-pressed={l === label} onClick={() => setShown(l)}>
            {l}
          </button>
        ))}
      </div>

      {/* Our own drawing code made this SVG, and it escapes every piece of text it writes. */}
      <div className="page-preview" dangerouslySetInnerHTML={{ __html: preview }} />
      <p className="muted small">
        {labels.length} cards, {pages.length} page{pages.length === 1 ? '' : 's'} in one PDF. Each shows that
        player in color and everyone else faded.
      </p>

      <button type="button" className="tool primary" disabled={busy} onClick={onDownload}>
        {busy ? 'Making PDF…' : 'Download player cards PDF'}
      </button>
      {error && <p className="warn small">{error}</p>}
    </section>
  )
}
