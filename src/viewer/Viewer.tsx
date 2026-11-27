import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useApp } from '../app/appStore'
import { Field } from '../field/Field'
import { searchPlays, stepPlay, swipeStep, tagCounts } from '../library/library'
import { formatYd } from '../model/format'
import { readOrderText } from '../pdf/playbookPages'
import { PlaybackBar } from '../playback/PlaybackBar'
import { checkPlay } from '../rules/checkPlay'
import { useEditor } from '../store/editorStore'

const titleCase = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1)

/** Keeps the screen on while plays are being looked at, where the device supports it. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    let stopped = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
        if (stopped) void lock?.release()
      } catch {
        // Not supported, or the battery is low. The screen will dim as usual.
      }
    }
    // The lock is dropped whenever the app goes to the background, so ask again on return.
    const onVisible = () => document.visibilityState === 'visible' && void request()
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}

/**
 * View mode: one play at a time, as big as the screen allows.
 * Swipe, tap the arrows, or use the arrow keys to flip through the playbook.
 * Nothing can be moved by accident here. "Edit" opens the editor on the same play.
 */
export function Viewer() {
  const play = useEditor((s) => s.play)
  const plays = useEditor((s) => s.plays)
  const rules = useEditor((s) => s.rules)
  const { openPlay } = useEditor.getState()
  const setViewing = useApp((s) => s.setViewing)
  const [tag, setTag] = useState<string | null>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  useWakeLock()

  const tags = tagCounts(plays)
  const activeTag = tag && tags.some((t) => t.tag === tag) ? tag : null
  const list = searchPlays(plays, '', activeTag)
  const index = list.findIndex((p) => p.id === play.id)

  const go = (step: 1 | -1) => {
    const next = stepPlay(list, play.id, step)
    if (next && next.id !== play.id) openPlay(next.id)
  }

  // Picking a tag jumps to its first play when the open one does not have it.
  const pickTag = (next: string | null) => {
    setTag(next)
    const filtered = searchPlays(plays, '', next)
    if (filtered.length > 0 && !filtered.some((p) => p.id === play.id)) openPlay(filtered[0].id)
  }

  // Arrow keys flip plays. Read the latest list through a ref so the listener is added once.
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onPointerDown = (e: PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!touch.current) return
    const step = swipeStep(e.clientX - touch.current.x, e.clientY - touch.current.y)
    touch.current = null
    if (step !== 0) go(step)
  }

  const reads = readOrderText(play)
  const warnings = checkPlay(play, rules)

  return (
    <div className="app viewer">
      <header className="viewer-bar">
        <div className="viewer-number" aria-label={`Play number ${play.number}`}>
          {play.number}
        </div>
        <div className="viewer-title">
          <h1>{play.name || 'Untitled'}</h1>
          <div className="muted">
            {play.formation} · Ball on the {formatYd(play.ballOn)}
          </div>
        </div>
        <button type="button" className="tool" onClick={() => setViewing(false)}>
          Edit
        </button>
      </header>

      {tags.length > 0 && (
        <div className="viewer-tags chips" role="group" aria-label="Filter by tag">
          <button type="button" className="pill" aria-pressed={activeTag === null} onClick={() => pickTag(null)}>
            All {plays.length}
          </button>
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              className="pill"
              aria-pressed={activeTag === t.tag}
              onClick={() => pickTag(activeTag === t.tag ? null : t.tag)}
            >
              {titleCase(t.tag)} {t.count}
            </button>
          ))}
        </div>
      )}

      <main
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (touch.current = null)}
      >
        <Field readOnly />
      </main>

      <PlaybackBar />

      {(reads || warnings.length > 0) && (
        <div className="viewer-info">
          {reads && <span>Reads: {reads}</span>}
          {warnings.length > 0 && <span className="warn">{warnings[0].message}</span>}
        </div>
      )}

      <footer className="viewer-nav">
        <button type="button" className="tool" disabled={index <= 0} onClick={() => go(-1)} aria-label="Previous play">
          ‹ Prev
        </button>
        <span className="muted" aria-live="polite">
          {index + 1} of {list.length}
        </span>
        <button
          type="button"
          className="tool"
          disabled={index < 0 || index >= list.length - 1}
          onClick={() => go(1)}
          aria-label="Next play"
        >
          Next ›
        </button>
      </footer>
    </div>
  )
}
