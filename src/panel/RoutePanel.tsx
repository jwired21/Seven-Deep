import type { ReactNode } from 'react'
import type { Assignment, Player } from '../model/types'
import { getAssignment, snapSpot, type Slot } from '../routes/assignments'
import {
  BLITZ_RUNS,
  getRoute,
  isTreeRoute,
  MAX_ROUTE_DEPTH,
  outsideDir,
  ROUTE_TREE,
  RUN_PATHS,
  type RouteTemplate,
} from '../routes/routeTree'
import { MAX_DELAY_COUNTS, MAX_READS, qbBlitzRunAllowed, useEditor, type FreehandKind } from '../store/editorStore'

const INK = '#1A1206'

type StepperProps = {
  label: string
  value: string
  /** Shown in the player's color when the setting is on. */
  accent?: string
  onLess?: () => void
  onMore?: () => void
  lessLabel: string
  moreLabel: string
}

function Stepper({ label, value, accent, onLess, onMore, lessLabel, moreLabel }: StepperProps) {
  return (
    <div className="row stepper">
      <span>{label}</span>
      <span className="stepper-controls">
        <button type="button" className="step" aria-label={lessLabel} disabled={!onLess} onClick={onLess}>
          −
        </button>
        <strong style={accent ? { color: accent } : undefined}>{value}</strong>
        <button type="button" className="step" aria-label={moreLabel} disabled={!onMore} onClick={onMore}>
          +
        </button>
      </span>
    </div>
  )
}

/** Depth and direction for a path that came from a template. */
function TemplateSettings({ player, assignment, slot }: { player: Player; assignment: Assignment; slot: Slot }) {
  const play = useEditor((s) => s.play)
  const { setRouteDepth, flipRoute } = useEditor.getState()
  const template = isTreeRoute(assignment.routeName) ? getRoute(assignment.routeName) : undefined
  if (!template) return null

  const depth = assignment.routeDepth ?? template.defaultDepth
  const right = outsideDir(snapSpot(play, player), assignment.routeFlipped) > 0
  return (
    <>
      <Stepper
        label="Depth"
        value={`${depth} yd`}
        lessLabel="Shallower"
        moreLabel="Deeper"
        onLess={depth > template.minDepth ? () => setRouteDepth(player.id, depth - 1, slot) : undefined}
        onMore={depth < MAX_ROUTE_DEPTH ? () => setRouteDepth(player.id, depth + 1, slot) : undefined}
      />
      <div className="row">
        <span>Outside is</span>
        <button type="button" className="link" onClick={() => flipRoute(player.id, slot)}>
          {right ? 'right' : 'left'} · flip
        </button>
      </div>
    </>
  )
}

type PickerProps = {
  title: string
  player: Player
  templates: RouteTemplate[]
  assignment: Assignment | undefined
  freehand: FreehandKind
  slot: Slot
  children?: ReactNode
}

/** A grid of template buttons plus Freehand, for one kind of path. */
function PathPicker({ title, player, templates, assignment, freehand, slot, children }: PickerProps) {
  const drawing = useEditor((s) => s.drawingFor === player.id && s.drawingSlot === slot)
  const { setRoute, startFreehand, stopFreehand } = useEditor.getState()

  // In the main slot, a route and a run share the slot. Only light up the kind this picker owns.
  const mine = assignment?.kind === freehand ? assignment : undefined
  const isCustom = !!mine && !isTreeRoute(mine.routeName)
  const drawingMine = drawing && assignment?.kind === freehand
  const active = { background: player.color, color: INK, borderColor: player.color, fontWeight: 600 }

  return (
    <section className="group">
      <h2 className="eyebrow">{title}</h2>
      <div className="route-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="tool"
            aria-pressed={mine?.routeName === template.id}
            style={mine?.routeName === template.id ? active : undefined}
            onClick={() => setRoute(player.id, template.id)}
          >
            {template.name}
          </button>
        ))}
        <button
          type="button"
          className="tool dashed"
          aria-pressed={isCustom}
          style={isCustom ? active : undefined}
          onClick={() => (drawingMine ? stopFreehand() : startFreehand(player.id, freehand))}
        >
          {drawingMine ? 'Done' : 'Freehand'}
        </button>
      </div>
      {drawingMine && (
        <p className="muted small">
          Click the field to add points. They snap to whole yards. Press Done, Enter, or Esc to finish, and Undo
          to take back a point.
        </p>
      )}
      {mine && children}
    </section>
  )
}

/** Everything the selected player can be told to do. */
export function RoutePanel({ player }: { player: Player }) {
  const play = useEditor((s) => s.play)
  const rules = useEditor((s) => s.rules)
  const drawingMotion = useEditor((s) => s.drawingFor === player.id && s.drawingSlot === 'motion')
  const { setDelay, setReadOrder, clearRoute, setHandoff, startFreehand, stopFreehand } = useEditor.getState()

  const main = getAssignment(play, player.id)
  const motion = getAssignment(play, player.id, 'motion')
  const blitz = getAssignment(play, player.id, 'blitz')
  const delay = main?.delayCounts ?? 0
  const hasPath = !!main && main.path.length > 0
  const others = play.players.filter((p) => p.id !== player.id)
  const active = { background: player.color, color: INK, borderColor: player.color, fontWeight: 600 }

  const delayStepper = hasPath && (
    <Stepper
      label="Delay"
      value={delay > 0 ? `${delay} count${delay > 1 ? 's' : ''}` : 'Off'}
      accent={delay > 0 ? player.color : undefined}
      lessLabel="Shorter delay"
      moreLabel="Longer delay"
      onLess={delay > 0 ? () => setDelay(player.id, delay - 1) : undefined}
      onMore={delay < MAX_DELAY_COUNTS ? () => setDelay(player.id, delay + 1) : undefined}
    />
  )

  const clear = (slot: Slot, label: string) => (
    <button type="button" className="tool" onClick={() => clearRoute(player.id, slot)}>
      {label}
    </button>
  )

  return (
    <>
      <PathPicker title="Route tree" player={player} templates={ROUTE_TREE} assignment={main} freehand="route" slot="main">
        {main && <TemplateSettings player={player} assignment={main} slot="main" />}
        {delayStepper}
        {hasPath && (
          <div className="row">
            <span>QB read</span>
            <span className="chips" role="group" aria-label="QB read order">
              {Array.from({ length: MAX_READS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip-button"
                  aria-pressed={main?.readOrder === n}
                  style={main?.readOrder === n ? active : undefined}
                  onClick={() => setReadOrder(player.id, main?.readOrder === n ? null : n)}
                >
                  {n}
                </button>
              ))}
            </span>
          </div>
        )}
        {clear('main', 'Clear route')}
      </PathPicker>

      <PathPicker title="Run" player={player} templates={RUN_PATHS} assignment={main} freehand="run" slot="main">
        {main && <TemplateSettings player={player} assignment={main} slot="main" />}
        {delayStepper}
        {clear('main', 'Clear run')}
      </PathPicker>

      {rules.handoffsAllowed && (
        <section className="group">
          <h2 className="eyebrow">Hand off to</h2>
          <div className="chips" role="group" aria-label="Hand off to">
            {others.map((other) => {
              const on = main?.kind === 'handoff' && main.handoffTo === other.id
              return (
                <button
                  key={other.id}
                  type="button"
                  className="chip-button"
                  aria-pressed={on}
                  style={on ? { background: other.color, color: INK, borderColor: other.color, fontWeight: 600 } : undefined}
                  onClick={() => setHandoff(player.id, on ? null : other.id)}
                >
                  {other.label}
                </button>
              )
            })}
          </div>
          {main?.kind === 'handoff' && (
            <p className="muted small">The carrier gets a dive if they have no run. Select them to change it.</p>
          )}
        </section>
      )}

      <section className="group">
        <h2 className="eyebrow">Motion before the snap</h2>
        <div className="route-grid two">
          <button
            type="button"
            className="tool dashed"
            aria-pressed={!!motion && motion.path.length > 0}
            style={motion && motion.path.length > 0 ? active : undefined}
            onClick={() => (drawingMotion ? stopFreehand() : startFreehand(player.id, 'motion'))}
          >
            {drawingMotion ? 'Done' : motion ? 'Redraw motion' : 'Draw motion'}
          </button>
          {motion && !drawingMotion && clear('motion', 'Clear motion')}
        </div>
        {drawingMotion && (
          <p className="muted small">
            Click behind the line of scrimmage. The player sets at the last point, and their route starts there.
          </p>
        )}
      </section>

      {player.label === 'QB' && qbBlitzRunAllowed(rules) && (
        <PathPicker
          title="QB run if blitzed"
          player={player}
          templates={BLITZ_RUNS}
          assignment={blitz}
          freehand="qbRunIfBlitzed"
          slot="blitz"
        >
          {blitz && <TemplateSettings player={player} assignment={blitz} slot="blitz" />}
          {clear('blitz', 'Clear QB run')}
        </PathPicker>
      )}
    </>
  )
}

/** The QB's progression, listed in order. Shown whenever any route has a read number. */
export function ReadOrder() {
  const play = useEditor((s) => s.play)
  const reads = play.assignments
    .filter((a) => a.kind === 'route' && a.readOrder)
    .sort((a, b) => a.readOrder! - b.readOrder!)
  if (reads.length === 0) return null

  return (
    <section className="group">
      <h2 className="eyebrow">QB read order</h2>
      <div className="chips">
        {reads.map((a) => {
          const player = play.players.find((p) => p.id === a.playerId)
          if (!player) return null
          const name = isTreeRoute(a.routeName) ? getRoute(a.routeName)!.name.toLowerCase() : 'route'
          return (
            <span key={a.playerId} className="read-chip" style={{ background: player.color }}>
              {a.readOrder} · {player.label} {name}
            </span>
          )
        })}
      </div>
    </section>
  )
}
