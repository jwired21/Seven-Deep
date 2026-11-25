import { useMemo, useState } from 'react'
import type { WristCoachLayout } from '../model/types'
import { exportFileName } from '../storage/playbookFile'
import { toPlaybook, useEditor } from '../store/editorStore'
import { NumberField } from '../ui/NumberField'
import { downloadPdf } from './download'
import { LETTER } from './playbookPages'
import { SvgSurface } from './svgSurface'
import { drawWristCoachSheet, wristCoachSheets } from './wristCoach'

const PER_WINDOW: WristCoachLayout['playsPerWindow'][] = [4, 6, 8, 12]

/** Wrist coach sheet: window size, how many, what goes in them, a preview, and the download. */
export function WristCoachPanel() {
  const plays = useEditor((s) => s.plays)
  const rules = useEditor((s) => s.rules)
  const playbookName = useEditor((s) => s.playbookName)
  const settings = useEditor((s) => s.wristCoach)
  // Select the stable array and map it here. A selector that builds a new array every time would loop.
  const players = useEditor((s) => s.play.players)
  const labels = players.map((p) => p.label)
  const { setWristCoach } = useEditor.getState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sheets = wristCoachSheets(settings, plays.length)
  const windows = sheets.reduce((sum, sheet) => sum + sheet.windows.length, 0)
  const extra = windows - settings.windows

  // The preview runs the same drawing code as the PDF, into an SVG instead of a file.
  const preview = useMemo(() => {
    const playbook = toPlaybook(useEditor.getState())
    const all = wristCoachSheets(playbook.wristCoach, playbook.plays.length)
    const surface = new SvgSurface('wrist')
    drawWristCoachSheet(surface, playbook, all[0], 1, all.length)
    return surface.toSvg(LETTER.width, LETTER.height, `Preview of wrist coach sheet 1 of ${all.length}`)
    // The store values are read through getState; these dependencies say when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plays, rules, playbookName, settings])

  const onDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      const { buildWristCoachPdf } = await import('./playbookPdf')
      const playbook = toPlaybook(useEditor.getState())
      const name = exportFileName(`${playbook.name} wrist coach`).replace(/\.json$/, '.pdf')
      downloadPdf(name, await buildWristCoachPdf(playbook))
    } catch (e) {
      console.error(e)
      setError('The PDF could not be made.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="group">
      <h2 className="eyebrow">Wrist coach sheet</h2>

      <NumberField label="Window width" value={settings.windowWidthIn} suffix="in" onCommit={(v) => v !== null && setWristCoach({ windowWidthIn: v })} />
      <NumberField label="Window height" value={settings.windowHeightIn} suffix="in" onCommit={(v) => v !== null && setWristCoach({ windowHeightIn: v })} />
      <NumberField label="Windows on the band" value={settings.windows} onCommit={(v) => v !== null && setWristCoach({ windows: v })} />

      <div className="segmented four" role="group" aria-label="Plays per window">
        {PER_WINDOW.map((n) => (
          <button key={n} type="button" aria-pressed={settings.playsPerWindow === n} onClick={() => setWristCoach({ playsPerWindow: n })}>
            {n}
            <small>plays</small>
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Who the sheet is for">
        <button type="button" aria-pressed={settings.mode === 'qb'} onClick={() => setWristCoach({ mode: 'qb' })}>
          QB sheet
        </button>
        <button
          type="button"
          aria-pressed={settings.mode === 'player'}
          onClick={() => setWristCoach({ mode: 'player', playerLabel: settings.playerLabel ?? labels[0] })}
        >
          Player sheet
        </button>
      </div>
      {settings.mode === 'player' && (
        <div className="chips" role="group" aria-label="Player to highlight">
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              className="chip-button"
              aria-pressed={settings.playerLabel === label}
              onClick={() => setWristCoach({ playerLabel: label })}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="segmented" role="group" aria-label="Ink">
        <button type="button" aria-pressed={settings.color} onClick={() => setWristCoach({ color: true })}>
          Color
        </button>
        <button type="button" aria-pressed={!settings.color} onClick={() => setWristCoach({ color: false })}>
          Black and white
        </button>
      </div>

      {/* Our own drawing code made this SVG, and it escapes every piece of text it writes. */}
      <div className="page-preview" dangerouslySetInnerHTML={{ __html: preview }} />
      <p className="muted small">
        Sheet 1 of {sheets.length}. {windows} window{windows === 1 ? '' : 's'} of {settings.windowWidthIn} ×{' '}
        {settings.windowHeightIn} in.
        {extra > 0 && ` ${extra} more than the band holds, because there are ${plays.length} plays.`}
      </p>
      <p className="warn small">Print at 100%. Do not fit to page. Then measure the 1-inch line.</p>

      <button type="button" className="tool primary" disabled={busy} onClick={onDownload}>
        {busy ? 'Making PDF…' : 'Download wrist coach PDF'}
      </button>
      {error && <p className="warn small">{error}</p>}
    </section>
  )
}
