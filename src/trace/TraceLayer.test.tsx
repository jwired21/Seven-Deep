import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FieldSvg } from '../field/FieldSvg'
import { DEFAULT_RULES } from '../model/defaults'
import type { Trace } from './trace'
import { TraceLayer } from './TraceLayer'

// 100 yd field with 10 yd end zones: the view from the 12 is 42 x 34 yd, so 840 x 680 px is 20 px per yard.
const rules = { ...DEFAULT_RULES, fieldLength: 100, endZoneDepth: 10 }
const trace: Trace = { src: 'blob:test', aspect: 0.5, center: { x: 0, y: 5 }, width: 20, opacity: 0.4 }

const render = (adjusting = false) =>
  renderToStaticMarkup(
    <FieldSvg ballOn={12} rules={rules} width={840} height={680}>
      {(transform) => <TraceLayer trace={trace} transform={transform} adjusting={adjusting} onMove={() => {}} />}
    </FieldSvg>,
  )

const attr = (tag: string, name: string) => Number(tag.match(new RegExp(` ${name}="([0-9.-]+)"`))?.[1])

describe('TraceLayer', () => {
  it('draws the picture at its size in yards: 20 x 10 yd is 400 x 200 px at 20 px per yard', () => {
    const image = render().match(/<image[^>]*>/)![0]
    expect(attr(image, 'width')).toBeCloseTo(400)
    expect(attr(image, 'height')).toBeCloseTo(200)
    expect(attr(image, 'opacity')).toBe(0.4)
    // Centered across the field.
    expect(attr(image, 'x') + 200).toBeCloseTo(420)
  })

  it('ignores the pointer unless it is being adjusted, so players stay draggable', () => {
    expect(render()).toContain('pointer-events:none')
    expect(render()).not.toContain('stroke-dasharray="6 4"')
  })

  it('shows an outline and can be dragged while adjusting', () => {
    const svg = render(true)
    expect(svg).toContain('cursor:move')
    expect(svg).toContain('stroke-dasharray="6 4"')
  })
})
