import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useApp } from './app/appStore'
import { Field } from './field/Field'
import { FORMATIONS } from './formations/formations'
import { LibraryPanel } from './library/LibraryPanel'
import { ballSpots, GRID, playingLength } from './model/defaults'
import { formatYd } from './model/format'
import { describeSpot, POSITION_NAMES } from './model/players'
import { ReadOrder, RoutePanel } from './panel/RoutePanel'
import { PlaybackBar } from './playback/PlaybackBar'
import { resetPlayback, usePlayback } from './playback/playbackStore'
import { checkPlay } from './rules/checkPlay'
import { RulesCheck, RulesPanel } from './rules/RulesPanel'
import { TracePanel } from './trace/TracePanel'
import { endCoalescing, redo, undo, useEditor } from './store/editorStore'
import { Viewer } from './viewer/Viewer'

/** Ctrl or Cmd + Z to undo. Add Shift, or use Ctrl + Y, to redo. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc leaves playback and unlocks the field.
      if (e.key === 'Escape' && usePlayback.getState().active) {
        e.preventDefault()
        resetPlayback()
        return
      }
      // Enter or Esc finishes a freehand route.
      if ((e.key === 'Enter' || e.key === 'Escape') && useEditor.getState().drawingFor) {
        e.preventDefault()
        useEditor.getState().stopFreehand()
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

export function App() {
  const play = useEditor((s) => s.play)
  const rules = useEditor((s) => s.rules)
  const selectedId = useEditor((s) => s.selectedId)
  const playbookName = useEditor((s) => s.playbookName)
  const hydrated = useEditor((s) => s.hydrated)
  const saveStatus = useEditor((s) => s.saveStatus)
  const viewing = useApp((s) => s.viewing)
  const playbackActive = usePlayback((s) => s.active)
  const offlineReady = useApp((s) => s.offlineReady)
  const { loadFormation, flipFormation, setBallOn, setGender } = useEditor.getState()
  const canUndo = useStore(useEditor.temporal, (h) => h.pastStates.length > 0)
  const canRedo = useStore(useEditor.temporal, (h) => h.futureStates.length > 0)

  useUndoShortcuts()

  // Wait for the saved playbook, so the default play never flashes up before it.
  if (!hydrated) return <div className="app loading">Loading your playbook…</div>

  if (viewing) return <Viewer />

  const selected = play.players.find((p) => p.id === selectedId)
  const warnings = checkPlay(play, rules)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SEVEN DEEP</div>
        <input
          className="playbook-name"
          aria-label="Playbook name"
          value={playbookName}
          maxLength={40}
          size={Math.max(8, playbookName.length)}
          onChange={(e) => useEditor.getState().renamePlaybook(e.target.value)}
        />
        <div className="muted">/</div>
        <div className="strong">
          {play.number}. {play.name || 'Untitled'} · {play.formation}
        </div>
        <div className="spacer" />
        <div className="chip">Rules: {rules.name}</div>
        <button type="button" className="tool primary" onClick={() => useApp.getState().setViewing(true)}>
          View plays
        </button>
      </header>

      <div className="workspace">
        <LibraryPanel />

        <main className="stage">
          <div className="toolbar">
            <div className="toolbar-group" role="group" aria-label="Formation">
              {FORMATIONS.map((formation) => {
                // "Trips Left" still counts as the trips template.
                const base = formation.name.replace(/ (Right|Left)$/, '')
                const active = play.formation.startsWith(base)
                return (
                  <button
                    key={formation.id}
                    type="button"
                    className="tool"
                    aria-pressed={active}
                    onClick={() => loadFormation(formation.id)}
                  >
                    {base}
                  </button>
                )
              })}
              <button type="button" className="tool" onClick={flipFormation}>
                Flip
              </button>
            </div>
            <div className="spacer" />
            <div className="toolbar-group">
              <button type="button" className="tool" disabled={!canUndo} onClick={undo}>
                Undo
              </button>
              <button type="button" className="tool" disabled={!canRedo} onClick={redo}>
                Redo
              </button>
            </div>
          </div>

          <Field />

          <PlaybackBar editing />

          <div className="status">
            <span>Grid: {GRID} yard</span>
            <span>
              Field: {rules.fieldWidth} × {formatYd(rules.fieldLength)} yd
            </span>
            <span>Ball on the {formatYd(play.ballOn)}</span>
            {offlineReady && <span>Works offline</span>}
            <span className={saveStatus === 'error' ? 'warn' : saveStatus === 'saved' ? 'ok' : undefined}>
              {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Not saved: browser storage is unavailable'}
            </span>
            {warnings.length === 0 ? (
              <span className="ok">No rule conflicts</span>
            ) : (
              <a className="warn" href="#rules-check">
                {warnings.length} rule warning{warnings.length > 1 ? 's' : ''}: {warnings[0].message}
              </a>
            )}
          </div>
        </main>

        <aside className="panel">
          <RulesCheck />

          <section className="group">
            <h2 className="eyebrow">Selected player</h2>
            {selected ? (
              <>
                <div className="headline">
                  <span className="swatch" style={{ background: selected.color }} />
                  {selected.label} · {POSITION_NAMES[selected.label] ?? 'Player'}
                </div>
                <div className="text-2">{describeSpot(selected.start)}</div>
                {rules.maxMales !== null || rules.femalePlayEvery !== null ? (
                  <div className="row">
                    <span>Gender</span>
                    <span className="chips" role="group" aria-label="Gender">
                      {(['F', 'M'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          className="chip-button"
                          aria-pressed={selected.gender === g}
                          onClick={() => setGender(selected.id, selected.gender === g ? null : g)}
                        >
                          {g}
                        </button>
                      ))}
                    </span>
                  </div>
                ) : null}
                <p className="muted small">Drag to move, or use the arrow keys. Snaps to whole yards.</p>
              </>
            ) : (
              <p className={playbackActive ? 'warn small' : 'muted small'}>
                {playbackActive
                  ? 'Playback is showing. Press Back to editing under the field to select and move players.'
                  : 'Tap a player to give them a route, a run, a handoff, or motion. Drag anyone to move them.'}
              </p>
            )}
          </section>

          {selected && <RoutePanel player={selected} />}

          <ReadOrder />

          <section className="group">
            <h2 className="eyebrow">Ball position</h2>
            <label className="row" htmlFor="ball-on">
              <span>Yards from goal line</span>
              <strong>{formatYd(play.ballOn)} yd</strong>
            </label>
            <input
              id="ball-on"
              type="range"
              min={1}
              max={playingLength(rules) - 1}
              step={1}
              value={play.ballOn}
              onChange={(e) => setBallOn(Number(e.target.value))}
              onPointerUp={endCoalescing}
              onKeyUp={endCoalescing}
              onBlur={endCoalescing}
            />
            <div className="segmented" role="group" aria-label="Rulebook ball spots">
              {ballSpots(rules).map((spot) => (
                <button
                  key={spot.label}
                  type="button"
                  aria-pressed={near(play.ballOn, spot.ballOn)}
                  onClick={() => {
                    endCoalescing()
                    setBallOn(spot.ballOn)
                    endCoalescing()
                  }}
                >
                  {spot.label}
                  <small>{formatYd(spot.ballOn)} yd</small>
                </button>
              ))}
            </div>
          </section>

          <TracePanel />

          <RulesPanel />
        </aside>
      </div>
    </div>
  )
}
