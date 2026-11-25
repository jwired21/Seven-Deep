import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getFormation } from '../formations/formations'
import { createFieldTransform } from '../geometry/fieldTransform'
import { createPlay, createPlayers, playerId } from '../model/players'
import type { Assignment, Point } from '../model/types'
import { buildRoute } from '../routes/routeTree'
import { RoutesLayer } from './RoutesLayer'

// 20 px per yard, ball at (400, 400). Downfield is up.
const transform = createFieldTransform({ xMin: -20, xMax: 20, yMin: -10, yMax: 20 }, { width: 800, height: 600 })
const players = createPlayers(getFormation('spread')!.spots)

const render = (
  assignments: Assignment[],
  extra: { drawingFor?: string; drawingSlot?: 'main' | 'motion' | 'blitz'; preview?: Point } = {},
) =>
  renderToStaticMarkup(
    <svg>
      <RoutesLayer play={{ ...createPlay('Spread', players), assignments }} transform={transform} {...extra} />
    </svg>,
  )

const routeFor = (label: string, routeName: string, more: Partial<Assignment> = {}): Assignment => ({
  playerId: playerId(label),
  kind: 'route',
  routeName,
  path: buildRoute(routeName as 'go', players.find((p) => p.label === label)!.start),
  ...more,
})

describe('RoutesLayer', () => {
  it('draws nothing for a play with no routes', () => {
    expect(render([])).not.toContain('data-route')
  })

  it('draws each route in its player’s color with one arrowhead', () => {
    const svg = render([routeFor('Y', 'out'), routeFor('Z', 'post')])
    expect(svg.match(/data-route="/g)).toHaveLength(2)
    expect(svg.match(/data-part="arrow"/g)).toHaveLength(2)
    expect(svg).toContain('data-route="Y" data-kind="route" stroke="#FFD23F"')
    expect(svg).toContain('data-route="Z" data-kind="route" stroke="#7FDBFF"')
  })

  it('starts the line at the player, converted from yards to pixels', () => {
    // Y lines up at (-8, -1): 8 yd left of the ball and 1 yd behind it.
    expect(render([routeFor('Y', 'go')])).toContain('d="M240 420L')
  })

  it('puts the arrow tip on the end of the route', () => {
    // A go from (-8, -1) ends 12 yd past the line: (240, 160) in pixels.
    const svg = render([routeFor('Y', 'go')])
    const points = svg.match(/data-part="arrow" points="([^"]+)"/)![1]
    expect(points.split(' ')[0]).toBe('240,160')
  })

  it('draws a delayed release as a dotted first stretch and a label', () => {
    const svg = render([routeFor('C', 'hitch', { delayCounts: 1 })])
    expect(svg).toContain('data-part="delay"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('delay 1')

    const plain = render([routeFor('C', 'hitch')])
    expect(plain).not.toContain('data-part="delay"')
    expect(plain).not.toContain('delay 1')
  })

  it('skips a route that has no waypoints yet', () => {
    const svg = render([{ playerId: playerId('Z'), kind: 'route', routeName: 'custom', path: [] }])
    expect(svg).not.toContain('data-part="arrow"')
    expect(svg).not.toContain('<path')
  })

  it('shows where the next freehand waypoint will land', () => {
    const drawing = { playerId: playerId('Z'), kind: 'route' as const, routeName: 'custom', path: [] }
    const svg = render([drawing], { drawingFor: playerId('Z'), preview: { x: 8, y: 4 } })
    // From Z at (8, -1) to the preview at (8, 4): (560, 420) to (560, 320).
    expect(svg).toContain('data-part="preview" d="M560 420L560 320"')
    expect(render([drawing])).not.toContain('data-part="preview"')
  })

  it('draws the first read heavier than the others and numbers every read', () => {
    const svg = render([routeFor('Y', 'out', { readOrder: 1 }), routeFor('Z', 'post', { readOrder: 2 }), routeFor('X', 'go')])
    const width = (label: string) => Number(svg.match(new RegExp(`data-route="${label}"[^>]*stroke-width="([0-9.]+)"`))![1])
    expect(width('Y')).toBeGreaterThan(width('Z'))
    expect(width('Z')).toBe(width('X'))
    expect(svg.match(/data-part="read"/g)).toHaveLength(2)
  })

  it('draws a run like a route: solid, with an arrowhead', () => {
    const run: Assignment = { ...routeFor('RB', 'sweep'), kind: 'run' }
    const svg = render([run])
    expect(svg).toContain('data-kind="run"')
    expect(svg.match(/data-part="arrow"/g)).toHaveLength(1)
    expect(svg).not.toContain('stroke-dasharray')
  })

  it('draws motion dashed, with no arrowhead, ending in a ring where the player sets', () => {
    const motion: Assignment = { playerId: playerId('Y'), kind: 'motion', routeName: 'custom', path: [{ x: 4, y: -1 }] }
    const svg = render([motion])
    expect(svg).toContain('data-kind="motion"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).not.toContain('data-part="arrow"')
    // Y starts at (-8, -1) and sets at (-4, -2): (320, 440) in pixels.
    expect(svg).toContain('data-part="set" cx="320" cy="440"')
  })

  it('starts a route where the motion ends', () => {
    const motion: Assignment = { playerId: playerId('Y'), kind: 'motion', routeName: 'custom', path: [{ x: 4, y: 0 }] }
    const svg = render([motion, routeFor('Y', 'go')])
    // Motion from (240, 420) to (320, 420), then the go starts at (320, 420).
    expect(svg).toContain('d="M240 420L320 420"')
    expect(svg).toContain('d="M320 420L')
  })

  it('draws the QB run if blitzed dashed, with an arrowhead and a label', () => {
    const blitz: Assignment = { ...routeFor('QB', 'roll'), kind: 'qbRunIfBlitzed' }
    const svg = render([blitz])
    expect(svg).toContain('data-kind="qbRunIfBlitzed"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('run if blitzed')
    expect(svg.match(/data-part="arrow"/g)).toHaveLength(1)
  })

  it('draws a handoff from the QB to the nearest point on the carrier’s run', () => {
    // RB at (3, -5) dives straight ahead. The QB at (0, -5) is level with the start of the run.
    const run: Assignment = { ...routeFor('RB', 'dive'), kind: 'run' }
    const handoff: Assignment = { playerId: playerId('QB'), kind: 'handoff', path: [], handoffTo: playerId('RB') }
    const svg = render([run, handoff])
    expect(svg).toContain('data-handoff="QB"')
    // From the QB at (400, 500) to the RB's path at (460, 500).
    expect(svg).toContain('d="M400 500L460 500"')
    expect(svg).toContain('handoff')
  })

  it('ignores the pointer so routes never block dragging a player', () => {
    expect(render([routeFor('Y', 'out')])).toContain('pointer-events:none')
  })
})
