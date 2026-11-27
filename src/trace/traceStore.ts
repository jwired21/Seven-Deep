import { create } from 'zustand'
import type { FieldView } from '../geometry/fieldTransform'
import { fitTrace, TRACE_OPACITY, type Trace } from './trace'

export type TraceState = {
  /** The picture being traced, if there is one. */
  trace: Trace | null
  /** While true the picture sits on top and a drag moves it. Players cannot be reached. */
  adjusting: boolean
  /** Keeps the picture loaded but out of sight, to check the play without it. */
  hidden: boolean
}

/** The tracing picture. Not part of the playbook: never saved, exported, printed, or undone. */
export const useTrace = create<TraceState>()(() => ({ trace: null, adjusting: false, hidden: false }))

const release = () => {
  const old = useTrace.getState().trace
  if (old?.src.startsWith('blob:')) URL.revokeObjectURL(old.src)
}

export function removeTrace() {
  release()
  useTrace.setState({ trace: null, adjusting: false, hidden: false })
}

/** Applies a change to the picture, if there is one. */
export function updateTrace(change: (trace: Trace) => Trace) {
  const { trace } = useTrace.getState()
  if (trace) useTrace.setState({ trace: change(trace) })
}

/**
 * Loads a picture file and lays it on the field, sized to fit the view. It starts in
 * adjusting mode, because lining it up is always the first thing to do.
 * Rejects with a message for the user when the file is not a picture the browser can show.
 */
export function loadTraceFile(file: Blob, view: FieldView): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not a picture. Use a PNG or JPG screenshot.'))
      return
    }
    const src = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(src)
        reject(new Error('That picture has no size, so it cannot be shown.'))
        return
      }
      const aspect = image.naturalHeight / image.naturalWidth
      release()
      useTrace.setState({
        trace: { src, aspect, ...fitTrace(aspect, view), opacity: TRACE_OPACITY.initial },
        adjusting: true,
        hidden: false,
      })
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('The browser could not read that picture. Try a PNG or JPG.'))
    }
    image.src = src
  })
}
