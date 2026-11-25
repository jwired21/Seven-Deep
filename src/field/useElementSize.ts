import { useLayoutEffect, useRef, useState } from 'react'
import type { SizePx } from '../geometry/fieldTransform'

/** Tracks an element's content box in pixels, so the field can redraw at any window size. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<SizePx>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const update = (width: number, height: number) =>
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))

    update(el.clientWidth, el.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) update(box.width, box.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
