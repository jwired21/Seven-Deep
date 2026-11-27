import { useMemo } from 'react'
import { create } from 'zustand'
import { useEditor } from '../store/editorStore'
import { buildTimeline, type Timeline } from './timeline'

export type PlaybackState = {
  /**
   * True once playback has been started or scrubbed. While it is, the field shows the
   * players where the timeline puts them, and nobody can be dragged. Reset turns it off.
   */
  active: boolean
  playing: boolean
  /** Seconds from the snap. Negative is before it. */
  time: number
  /** 1 is real time. 0.5 is half speed. */
  rate: number
  /** Show what happens on a blitz instead of the called play. */
  blitz: boolean
}

/** Where playback is. Not part of the playbook, and never saved. */
export const usePlayback = create<PlaybackState>()(() => ({
  active: false,
  playing: false,
  time: 0,
  rate: 1,
  blitz: false,
}))

/** Back to the still diagram. */
export const resetPlayback = () => usePlayback.setState({ active: false, playing: false, time: 0 })

/** The open play worked out in time. Rebuilt only when the play or the blitz switch changes. */
export function useTimeline(): Timeline {
  const play = useEditor((s) => s.play)
  const blitz = usePlayback((s) => s.blitz)
  return useMemo(() => buildTimeline(play, { blitz }), [play, blitz])
}
