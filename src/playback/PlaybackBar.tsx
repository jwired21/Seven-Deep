import { useEffect } from 'react'
import { getAssignment } from '../routes/assignments'
import { useEditor } from '../store/editorStore'
import { resetPlayback, usePlayback, useTimeline } from './playbackStore'
import { advance, describeTime, passerOf } from './timeline'

const INK = '#1A1206'

/**
 * Runs the clock while playing: each animation frame moves time forward by however long
 * the frame took, so playback is real time on any screen.
 */
function usePlaybackClock(start: number, end: number) {
  const playing = usePlayback((s) => s.playing)
  const rate = usePlayback((s) => s.rate)
  useEffect(() => {
    if (!playing) return
    let frame = 0
    // Measure from the moment play was pressed, not frame to frame, so the play runs in
    // real time on any device. A slow screen shows fewer frames, never a slower play.
    const startedAt = performance.now()
    const startedFrom = usePlayback.getState().time
    const tick = (now: number) => {
      const next = advance(startedFrom, (now - startedAt) / 1000, rate, { start, end })
      usePlayback.setState(next)
      if (next.playing) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // Pause when the app goes to the background, so it does not finish unseen.
    const onHidden = () => document.visibilityState === 'hidden' && usePlayback.setState({ playing: false })
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [playing, rate, start, end])
}

/**
 * Watch the play develop: play and pause, a slider to scrub back and forth, who the ball
 * goes to, half speed, and a switch to see what happens on a blitz.
 */
export function PlaybackBar({ editing = false }: { editing?: boolean }) {
  const play = useEditor((s) => s.play)
  const { setPassTo } = useEditor.getState()
  const timeline = useTimeline()
  const { active, playing, time, rate, blitz } = usePlayback()

  usePlaybackClock(timeline.start, timeline.end)

  // A different play starts from its own still diagram.
  useEffect(() => resetPlayback, [play.id])

  const shown = active ? Math.min(timeline.end, Math.max(timeline.start, time)) : timeline.start
  const atEnd = shown >= timeline.end - 1e-6

  const onPlayPause = () => {
    if (playing) usePlayback.setState({ playing: false })
    // Pressing play at the end runs it again from the top.
    else usePlayback.setState({ active: true, playing: true, time: !active || atEnd ? timeline.start : shown })
  }

  const receivers = play.players.filter((p) => {
    const a = getAssignment(play, p.id)
    return a?.kind === 'route' && a.path.length > 0
  })
  const passer = passerOf(play)
  const canBlitz = !!passer && (getAssignment(play, passer.id, 'blitz')?.path.length ?? 0) > 0
  const isPass = timeline.throwAt !== null || (receivers.length > 0 && timeline.targetId === null)

  return (
    <section className="playback" aria-label="Playback">
      <div className="playback-row">
        <button type="button" className="tool primary playback-play" onClick={onPlayPause}>
          {playing ? 'Pause' : atEnd && active ? 'Replay' : 'Play'}
        </button>
        <input
          type="range"
          className="playback-slider"
          aria-label="Time in the play"
          aria-valuetext={describeTime(shown)}
          min={timeline.start}
          max={timeline.end}
          step={0.01}
          value={shown}
          onChange={(e) => {
            const value = Number(e.target.value)
            // Dragging all the way back to the start is the same as Reset: the field unlocks.
            if (value <= timeline.start + 0.005) resetPlayback()
            else usePlayback.setState({ active: true, playing: false, time: value })
          }}
        />
        <span className="playback-time">{describeTime(shown)}</span>
        <button
          type="button"
          className={active && editing ? 'tool attention' : 'tool'}
          disabled={!active}
          onClick={resetPlayback}
        >
          {editing ? 'Back to editing' : 'Reset'}
        </button>
      </div>

      {active && editing && (
        <p className="playback-locked" role="status">
          Playback is showing, so players are locked and a tap picks who the ball goes to. Press{' '}
          <strong>Back to editing</strong> or Esc to move players and change routes.
        </p>
      )}

      <div className="playback-row options">
        {receivers.length > 0 && !blitz && isPass && (
          <span className="chips" role="group" aria-label="Throw to">
            <span className="muted">Throw to</span>
            {receivers.map((p) => {
              const on = timeline.targetId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  className="chip-button"
                  aria-pressed={on}
                  style={on ? { background: p.color, color: INK, borderColor: p.color, fontWeight: 600 } : undefined}
                  onClick={() => setPassTo(p.id)}
                >
                  {p.label}
                </button>
              )
            })}
          </span>
        )}
        <span className="spacer" />
        {canBlitz && (
          <button type="button" className="chip-button wide" aria-pressed={blitz} onClick={() => usePlayback.setState({ blitz: !blitz })}>
            Show blitz
          </button>
        )}
        <button
          type="button"
          className="chip-button wide"
          aria-pressed={rate !== 1}
          onClick={() => usePlayback.setState({ rate: rate === 1 ? 0.5 : 1 })}
        >
          Half speed
        </button>
      </div>
    </section>
  )
}
