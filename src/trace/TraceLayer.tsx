import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FieldTransform } from '../geometry/fieldTransform'
import type { Point } from '../model/types'
import { traceRect, type Trace } from './trace'

const ACCENT = '#FF8A3D'

type Props = {
  trace: Trace
  transform: FieldTransform
  /** When true, a drag on the picture moves it. Otherwise it ignores the pointer entirely. */
  adjusting?: boolean
  /** Called as the picture is dragged, with where its middle should go, in yards. */
  onMove?(center: Point): void
}

/** The tracing picture, drawn faded on the field from its place and size in yards. */
export function TraceLayer({ trace, transform: t, adjusting = false, onMove }: Props) {
  const box = t.rectToPx(traceRect(trace))

  const onPointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg || !onMove) return
    e.stopPropagation()
    e.preventDefault()
    const yd = (ev: { clientX: number; clientY: number }) => {
      const b = svg.getBoundingClientRect()
      return t.toYd({ x: ev.clientX - b.left, y: ev.clientY - b.top })
    }
    // Hold the picture where it was grabbed, so it does not jump to the pointer.
    const at = yd(e)
    const grab = { x: at.x - trace.center.x, y: at.y - trace.center.y }
    const move = (ev: PointerEvent) => {
      const p = yd(ev)
      onMove({ x: p.x - grab.x, y: p.y - grab.y })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <g
      data-part="trace"
      clipPath="url(#field-view-clip)"
      style={adjusting ? { cursor: 'move', touchAction: 'none' } : { pointerEvents: 'none' }}
      onPointerDown={adjusting ? onPointerDown : undefined}
    >
      <image href={trace.src} {...box} preserveAspectRatio="none" opacity={trace.opacity} />
      {adjusting && (
        <rect {...box} fill="transparent" stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" />
      )}
    </g>
  )
}
