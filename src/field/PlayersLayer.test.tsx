import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getFormation } from '../formations/formations'
import { DEFAULT_RULES } from '../model/defaults'
import { createPlayers } from '../model/players'
import { FieldSvg } from './FieldSvg'
import { playerRadius, PlayersLayer } from './PlayersLayer'

// 100 yd field with 10 yd end zones: the view from the 12 is 42 x 34 yd, so 840 x 680 px is 20 px per yard.
const rules = { ...DEFAULT_RULES, fieldLength: 100, endZoneDepth: 10 }
const players = createPlayers(getFormation('spread')!.spots)

const render = (selectedId: string | null = null) =>
  renderToStaticMarkup(
    <FieldSvg ballOn={12} rules={rules} width={840} height={680}>
      {(transform) => (
        <PlayersLayer
          players={players}
          transform={transform}
          selectedId={selectedId}
          onSelect={() => {}}
          onMove={() => {}}
          constrain={(p) => p}
        />
      )}
    </FieldSvg>,
  )

const positionOf = (svg: string, label: string) => {
  const m = svg.match(new RegExp(`data-player="${label}"[^>]*transform="translate\\(([\\d.-]+) ([\\d.-]+)\\)"`))
  if (!m) throw new Error(`player ${label} not drawn`)
  return { x: Number(m[1]), y: Number(m[2]) }
}

describe('PlayersLayer', () => {
  it('draws all 7 players', () => {
    expect(render().match(/data-player="/g)).toHaveLength(7)
  })

  it('places each player at their yard spot, converted to pixels', () => {
    const svg = render()
    // The ball is at (420, 440). One yard is 20 px. Downfield is up.
    expect(positionOf(svg, 'C')).toEqual({ x: 420, y: 460 })
    expect(positionOf(svg, 'QB')).toEqual({ x: 420, y: 540 })
    expect(positionOf(svg, 'X')).toEqual({ x: 420 - 16 * 20, y: 460 })
    expect(positionOf(svg, 'W')).toEqual({ x: 420 + 16 * 20, y: 460 })
    expect(positionOf(svg, 'RB')).toEqual({ x: 420 + 3 * 20, y: 540 })
  })

  it('marks only the selected player as pressed', () => {
    const svg = render(players[0].id)
    expect(svg.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(render().match(/aria-pressed="true"/g)).toBeNull()
  })

  it('describes each player and where they are for screen readers', () => {
    expect(render()).toContain('aria-label="X, Receiver. 16 yd left, 1 yd back.')
  })

  it('keeps markers readable on a phone and to scale on a big screen', () => {
    expect(playerRadius(6)).toBe(9)
    expect(playerRadius(16)).toBeCloseTo(13.6, 9)
    expect(playerRadius(40)).toBe(16)
  })
})
