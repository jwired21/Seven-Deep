import { useEffect, useRef, useState } from 'react'
import { fieldView } from '../geometry/fieldLayout'
import { formatYd } from '../model/format'
import { useEditor } from '../store/editorStore'
import { fadeTrace, resizeTrace, TRACE_MIN_WIDTH, TRACE_OPACITY, traceMaxWidth } from './trace'
import { loadTraceFile, removeTrace, updateTrace, useTrace } from './traceStore'

/**
 * Lay a screenshot of a play on the field and trace over it: line it up, then drag the
 * players onto theirs and draw the routes on top.
 */
export function TracePanel() {
  const ballOn = useEditor((s) => s.play.ballOn)
  const rules = useEditor((s) => s.rules)
  const { trace, adjusting, hidden } = useTrace()
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const view = fieldView(ballOn, rules)
  const viewRef = useRef(view)
  viewRef.current = view

  const load = (file: Blob) => {
    setError(null)
    loadTraceFile(file, viewRef.current).catch((e: Error) => setError(e.message))
  }

  // A screenshot on the clipboard can be pasted straight in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      load(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <section className="group">
      <h2 className="eyebrow">Trace a picture</h2>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Picture to trace"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) load(file)
          // Let the same file be chosen again after it is removed.
          e.target.value = ''
        }}
      />

      {!trace ? (
        <>
          <button type="button" className="tool" onClick={() => fileInput.current?.click()}>
            Choose a picture
          </button>
          <p className="muted small">
            Put a screenshot of a play behind the field, or paste one with Ctrl + V. Then drag your players onto
            theirs and draw the routes over the top. The picture is only a guide: it is not saved or printed.
          </p>
        </>
      ) : (
        <>
          <div className="chips">
            <button
              type="button"
              className={adjusting ? 'tool attention' : 'tool'}
              aria-pressed={adjusting}
              onClick={() => useTrace.setState({ adjusting: !adjusting, hidden: false })}
            >
              {adjusting ? 'Done moving' : 'Move picture'}
            </button>
            <button
              type="button"
              className="tool"
              aria-pressed={hidden}
              onClick={() => useTrace.setState({ hidden: !hidden, adjusting: false })}
            >
              Hide
            </button>
            <button type="button" className="tool" onClick={() => fileInput.current?.click()}>
              Replace
            </button>
            <button type="button" className="tool danger" onClick={removeTrace}>
              Remove
            </button>
          </div>

          {adjusting && (
            <p className="playback-locked" role="status">
              Drag the picture on the field and set its size, so its line of scrimmage sits on yours. Press{' '}
              <strong>Done moving</strong> to get back to the players.
            </p>
          )}

          <label className="row" htmlFor="trace-size">
            <span>Size</span>
            <strong>{formatYd(Math.round(trace.width))} yd wide</strong>
          </label>
          <input
            id="trace-size"
            type="range"
            min={TRACE_MIN_WIDTH}
            max={traceMaxWidth(view)}
            step={0.5}
            value={trace.width}
            onChange={(e) => updateTrace((t) => resizeTrace(t, Number(e.target.value), viewRef.current))}
          />

          <label className="row" htmlFor="trace-fade">
            <span>Strength</span>
            <strong>{Math.round(trace.opacity * 100)}%</strong>
          </label>
          <input
            id="trace-fade"
            type="range"
            min={TRACE_OPACITY.min}
            max={TRACE_OPACITY.max}
            step={0.05}
            value={trace.opacity}
            onChange={(e) => updateTrace((t) => fadeTrace(t, Number(e.target.value)))}
          />
        </>
      )}

      {error && (
        <p className="warn small" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
