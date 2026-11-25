import { temporal } from 'zundo'
import { create } from 'zustand'
import { applyFormation, flipFormationName, flipPlayers, FORMATIONS, getFormation } from '../formations/formations'
import { fieldBounds, lineupBounds, lineupSpot, waypointSpot } from '../geometry/snap'
import {
  duplicatePlay as copyOf,
  MAX_PLAY_NUMBER,
  mirrorPlay as mirrorOf,
  newPlay as blankPlay,
  normalizeTag,
  sortPlays,
} from '../library/library'
import { DEFAULT_RULES, DEFAULT_WRIST_COACH } from '../model/defaults'
import { createPlay, createPlayers } from '../model/players'
import type { Assignment, Play, Playbook, Point, RulesProfile, WristCoachLayout, Yd } from '../model/types'
import {
  getAssignment,
  pathOrigin,
  refitRoutes,
  slotOf,
  snapSpot,
  withAssignment,
  withoutAssignment,
  type Slot,
} from '../routes/assignments'
import { sanitizeWristCoach } from '../pdf/wristCoach'
import { fieldChanged, fitPlayToRules, sanitizeRules } from '../rules/rules'
import { buildRoute, clampDepth, getRoute, isTreeRoute, type RouteId } from '../routes/routeTree'

export const MAX_DELAY_COUNTS = 3
export const MAX_READS = 3

/** The kinds of path that can be drawn by hand. */
export type FreehandKind = 'route' | 'run' | 'motion' | 'qbRunIfBlitzed'

export type SaveStatus = 'saved' | 'saving' | 'error'

export type EditorState = {
  /** The play being edited. This is the only part that undo and redo touch. */
  play: Play
  /**
   * Every play in the playbook, the one being edited included. There is no save button:
   * an edit to `play` lands here straight away, and from here in browser storage.
   */
  plays: Play[]
  playbookId: string
  playbookName: string
  wristCoach: WristCoachLayout
  /** False until the saved playbook has been read from browser storage. */
  hydrated: boolean
  saveStatus: SaveStatus
  rules: RulesProfile
  selectedId: string | null
  /** The player whose freehand path is being drawn, if any, and which of their slots it is. */
  drawingFor: string | null
  drawingSlot: Slot

  /** Moves a player to the legal, on-grid spot nearest `to`. Their paths go with them. */
  movePlayer(id: string, to: Point): void
  loadFormation(formationId: string): void
  flipFormation(): void
  setBallOn(ballOn: Yd): void
  /**
   * Changes settings on the rules profile. Not an undo step. When the field changes size,
   * every play is refitted to it and undo history starts over.
   */
  setRules(patch: Partial<RulesProfile>): void
  /** Changes the wrist coach sheet settings: window size, count, plays per window, mode, color. */
  setWristCoach(patch: Partial<WristCoachLayout>): void
  /** Sets a player's gender across the whole playbook, for the coed rules. Null clears it. */
  setGender(playerId: string, gender: 'M' | 'F' | null): void
  select(id: string | null): void

  /**
   * Gives the player a path from a template, at its usual depth: a pass route, a run path,
   * or a QB run if blitzed. The template decides which.
   */
  setRoute(playerId: string, routeId: RouteId): void
  setRouteDepth(playerId: string, depth: Yd, slot?: Slot): void
  /** Sends a template path the other way: an out to the middle, a sweep to the other side. */
  flipRoute(playerId: string, slot?: Slot): void
  /** Delayed release. 0 turns it off. */
  setDelay(playerId: string, counts: number): void
  /** Where this route sits in the QB's progression. Null takes it out. One player per number. */
  setReadOrder(playerId: string, order: number | null): void
  /** Removes the assignment in a slot. For a motion, the player's other paths move back to their start. */
  clearRoute(playerId: string, slot?: Slot): void

  /**
   * Hands the ball from one player to another. The carrier gets a dive if they have no run yet.
   * Null removes the handoff.
   */
  setHandoff(giverId: string, carrierId: string | null): void

  /** Starts a new freehand path for the player. Each click on the field then adds a waypoint. */
  /** Switches to another play in the playbook. Undo history starts over. */
  openPlay(id: string): void
  /** Adds a blank play with the next call number and opens it. */
  newPlay(): void
  /** Copies a play, gives the copy the next call number, and opens it. */
  duplicatePlay(id: string): void
  /** Makes the same play run to the other side, as a new play, and opens it. */
  mirrorPlay(id: string): void
  /** Removes a play. The playbook always keeps at least one. */
  deletePlay(id: string): void
  renamePlay(name: string): void
  /** The call number on the wrist coach, 1 to 999. */
  setPlayNumber(number: number): void
  toggleTag(tag: string): void
  renamePlaybook(name: string): void
  /** Replaces everything with a playbook read from storage or an import file. */
  loadPlaybook(playbook: Playbook): void

  startFreehand(playerId: string, kind?: FreehandKind): void
  /** Adds a waypoint at the on-grid spot nearest `at`, a field position in yards. */
  addWaypoint(at: Point): void
  stopFreehand(): void
}

export function initialPlay(): Play {
  const formation = FORMATIONS[0]
  return createPlay(formation.name, createPlayers(formation.spots))
}

/** True when the rules profile lets the QB have a "run if blitzed" path. */
export const qbBlitzRunAllowed = (rules: RulesProfile) => rules.blitzAllowed && rules.qbRunOnBlitz

/**
 * Changes made in a row under the same key share one undo step, so dragging the
 * ball slider across twenty yards undoes in one go.
 */
let coalesceKey: string | null = null

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => {
      /** Updates the play. Every call is one undo step, unless it continues a coalesced run. */
      const edit = (play: Play, key: string | null = null) => {
        const history = useEditor.temporal.getState()
        const merge = key !== null && key === coalesceKey
        if (merge) history.pause()
        set({ play })
        if (merge) history.resume()
        coalesceKey = key
      }

      const field = (play: Play = get().play) => fieldBounds(play.ballOn, get().rules)
      const playerIn = (play: Play, id: string | null) => play.players.find((p) => p.id === id)

      /** The player and their path in a slot, when the path came from a template. */
      const templatePath = (playerId: string, slot: Slot) => {
        const { play } = get()
        const player = playerIn(play, playerId)
        const assignment = getAssignment(play, playerId, slot)
        if (!player || !assignment || !isTreeRoute(assignment.routeName)) return null
        return { play, player, assignment, routeId: assignment.routeName }
      }

      /** The settings that survive when a player's main assignment is replaced. */
      const carryOver = (a: Assignment | undefined, keepRead: boolean) => ({
        ...(a?.delayCounts ? { delayCounts: a.delayCounts } : {}),
        ...(keepRead && a?.readOrder ? { readOrder: a.readOrder } : {}),
      })

      /** Shows a different play, or a new one. Undo history belongs to one play, so it starts over. */
      const show = (play: Play, plays: Play[]) => {
        set({ play, plays, selectedId: null, drawingFor: null, drawingSlot: 'main' })
        coalesceKey = null
        useEditor.temporal.getState().clear()
      }

      const stopDrawing = () => {
        if (get().drawingFor) set({ drawingFor: null, drawingSlot: 'main' })
      }

      const first = initialPlay()

      return {
        play: first,
        plays: [first],
        playbookId: crypto.randomUUID(),
        playbookName: 'My Playbook',
        wristCoach: DEFAULT_WRIST_COACH,
        hydrated: false,
        saveStatus: 'saved',
        rules: DEFAULT_RULES,
        selectedId: null,
        drawingFor: null,
        drawingSlot: 'main',

        movePlayer(id, to) {
          const { play, rules } = get()
          const player = playerIn(play, id)
          if (!player) return
          const spot = lineupSpot(to, play.ballOn, rules)
          if (spot.x === player.start.x && spot.y === player.start.y) return
          const moved = {
            ...play,
            players: play.players.map((p) => (p.id === id ? { ...p, start: spot } : p)),
          }
          edit(refitRoutes(moved, rules))
        },

        loadFormation(formationId) {
          const formation = getFormation(formationId)
          if (!formation) return
          const { play, rules } = get()
          const moved = {
            ...play,
            formation: formation.name,
            players: applyFormation(play.players, formation, lineupBounds(play.ballOn, rules)),
          }
          edit(refitRoutes(moved, rules))
        },

        flipFormation() {
          const { play, rules } = get()
          const players = flipPlayers(play.players)
          // Whoever crossed the ball takes the shape of their freehand paths across with them.
          const crossed = new Set(players.filter((p, i) => p !== play.players[i]).map((p) => p.id))
          const flipped = { ...play, formation: flipFormationName(play.formation), players }
          edit(refitRoutes(flipped, rules, crossed))
        },

        setBallOn(ballOn) {
          const { play, rules } = get()
          if (ballOn === play.ballOn) return
          // The end zone may now be closer, so paths are refitted to the field.
          edit(refitRoutes({ ...play, ballOn }, rules), 'ballOn')
        },

        setRules(patch) {
          const previous = get().rules
          const rules = sanitizeRules({ ...previous, ...patch })
          if (!fieldChanged(previous, rules)) {
            set({ rules })
            return
          }
          get().stopFreehand()
          const { play, plays, selectedId } = get()
          const fitted = plays.map((p) => fitPlayToRules(p, rules))
          set({ rules })
          show(fitted.find((p) => p.id === play.id)!, fitted)
          set({ selectedId })
        },

        setWristCoach(patch) {
          set({ wristCoach: sanitizeWristCoach({ ...get().wristCoach, ...patch }) })
        },

        setGender(playerId, gender) {
          const apply = (p: Play): Play => ({
            ...p,
            players: p.players.map((player) => {
              if (player.id !== playerId) return player
              const { gender: _old, ...rest } = player
              return gender ? { ...rest, gender } : rest
            }),
          })
          const { play, plays } = get()
          const next = plays.map(apply)
          // A roster fact, not an edit to this play: it is saved but is not an undo step.
          const history = useEditor.temporal.getState()
          history.pause()
          set({ play: next.find((p) => p.id === play.id)!, plays: next })
          history.resume()
        },

        select(id) {
          const { selectedId, drawingFor } = get()
          if (drawingFor && id !== drawingFor) get().stopFreehand()
          if (id !== selectedId) set({ selectedId: id })
        },

        setRoute(playerId, routeId) {
          const route = getRoute(routeId)
          const { play, rules } = get()
          const player = playerIn(play, playerId)
          if (!route || !player) return
          if (route.kind === 'qbRunIfBlitzed' && !qbBlitzRunAllowed(rules)) return
          stopDrawing()

          const existing = getAssignment(play, playerId, slotOf(route.kind))
          // Picking the same template again keeps its depth. A different one starts at its own usual depth.
          const depth = existing?.routeName === routeId ? (existing.routeDepth ?? route.defaultDepth) : route.defaultDepth
          const flipped = isTreeRoute(existing?.routeName) ? existing?.routeFlipped : undefined
          edit(
            withAssignment(play, {
              ...carryOver(existing, route.kind === 'route'),
              playerId,
              kind: route.kind,
              routeName: routeId,
              routeDepth: depth,
              ...(flipped ? { routeFlipped: true } : {}),
              path: buildRoute(routeId, snapSpot(play, player), { depth, flipped, bounds: field(play) }),
            }),
          )
        },

        setRouteDepth(playerId, depth, slot = 'main') {
          const found = templatePath(playerId, slot)
          if (!found) return
          const { play, player, assignment, routeId } = found
          const next = clampDepth(getRoute(routeId)!, depth)
          if (next === assignment.routeDepth) return
          edit(
            withAssignment(play, {
              ...assignment,
              routeDepth: next,
              path: buildRoute(routeId, snapSpot(play, player), {
                depth: next,
                flipped: assignment.routeFlipped,
                bounds: field(play),
              }),
            }),
          )
        },

        flipRoute(playerId, slot = 'main') {
          const found = templatePath(playerId, slot)
          if (!found) return
          const { play, player, assignment, routeId } = found
          const { routeFlipped, ...rest } = assignment
          const flipped = !routeFlipped
          edit(
            withAssignment(play, {
              ...rest,
              ...(flipped ? { routeFlipped: true } : {}),
              path: buildRoute(routeId, snapSpot(play, player), {
                depth: assignment.routeDepth,
                flipped,
                bounds: field(play),
              }),
            }),
          )
        },

        setDelay(playerId, counts) {
          const { play } = get()
          const assignment = getAssignment(play, playerId)
          if (!assignment) return
          const next = Math.min(MAX_DELAY_COUNTS, Math.max(0, Math.round(counts)))
          if (next === (assignment.delayCounts ?? 0)) return
          const { delayCounts: _old, ...rest } = assignment
          edit(withAssignment(play, next > 0 ? { ...rest, delayCounts: next } : rest))
        },

        setReadOrder(playerId, order) {
          const { play } = get()
          const assignment = getAssignment(play, playerId)
          if (!assignment || assignment.kind !== 'route') return
          const next = order === null ? null : Math.min(MAX_READS, Math.max(1, Math.round(order)))
          if ((assignment.readOrder ?? null) === next) return
          edit({
            ...play,
            assignments: play.assignments.map((a) => {
              const { readOrder, ...rest } = a
              if (a === assignment) return next === null ? rest : { ...rest, readOrder: next }
              // Whoever had this number gives it up.
              return readOrder === next ? rest : a
            }),
          })
        },

        clearRoute(playerId, slot = 'main') {
          const { play, rules, drawingFor, drawingSlot } = get()
          if (drawingFor === playerId && drawingSlot === slot) stopDrawing()
          if (!getAssignment(play, playerId, slot)) return
          const cleared = withoutAssignment(play, playerId, slot)
          // Without the motion, the player's other paths start from their lineup spot again.
          edit(slot === 'motion' ? refitRoutes(cleared, rules) : cleared)
        },

        setHandoff(giverId, carrierId) {
          const { play, rules } = get()
          const giver = playerIn(play, giverId)
          if (!giver) return
          stopDrawing()

          if (carrierId === null) {
            if (getAssignment(play, giverId)?.kind === 'handoff') edit(withoutAssignment(play, giverId))
            return
          }
          const carrier = playerIn(play, carrierId)
          if (!carrier || carrierId === giverId || !rules.handoffsAllowed) return

          let next = withAssignment(play, { playerId: giverId, kind: 'handoff', path: [], handoffTo: carrierId })
          // The carrier needs somewhere to run. Give them a dive unless they already have a run.
          const carrying = getAssignment(next, carrierId)
          if (carrying?.kind !== 'run') {
            const dive = getRoute('dive')!
            next = withAssignment(next, {
              ...carryOver(carrying, false),
              playerId: carrierId,
              kind: 'run',
              routeName: dive.id,
              routeDepth: dive.defaultDepth,
              path: buildRoute(dive.id, snapSpot(next, carrier), { bounds: field(play) }),
            })
          }
          edit(next)
        },

        openPlay(id) {
          const { play, plays } = get()
          const next = plays.find((p) => p.id === id)
          if (!next || next.id === play.id) return
          get().stopFreehand()
          show(next, get().plays)
        },

        newPlay() {
          get().stopFreehand()
          const { plays } = get()
          const blank = blankPlay(plays)
          // The same people are on the field, so the new play keeps their genders.
          const genders = new Map(get().play.players.map((p) => [p.id, p.gender]))
          const fresh = {
            ...blank,
            players: blank.players.map((p) => (genders.get(p.id) ? { ...p, gender: genders.get(p.id) } : p)),
          }
          show(fresh, [...plays, fresh])
        },

        duplicatePlay(id) {
          get().stopFreehand()
          const { plays } = get()
          const source = plays.find((p) => p.id === id)
          if (!source) return
          const copy = copyOf(source, plays)
          show(copy, [...plays, copy])
        },

        mirrorPlay(id) {
          get().stopFreehand()
          const { plays, rules } = get()
          const source = plays.find((p) => p.id === id)
          if (!source) return
          const mirrored = mirrorOf(source, plays, rules)
          show(mirrored, [...plays, mirrored])
        },

        deletePlay(id) {
          const { play, plays } = get()
          if (!plays.some((p) => p.id === id)) return
          const ordered = sortPlays(plays)
          const remaining = plays.filter((p) => p.id !== id)
          if (remaining.length === 0) {
            const fresh = blankPlay([])
            show(fresh, [fresh])
          } else if (id === play.id) {
            // Open the play that came after the deleted one, or the one before it at the end of the list.
            const index = ordered.findIndex((p) => p.id === id)
            show(ordered[index + 1] ?? ordered[index - 1], remaining)
          } else {
            set({ plays: remaining })
          }
        },

        renamePlay(name) {
          const { play } = get()
          if (name !== play.name) edit({ ...play, name }, 'name')
        },

        setPlayNumber(number) {
          const { play } = get()
          if (!Number.isFinite(number)) return
          const next = Math.min(MAX_PLAY_NUMBER, Math.max(1, Math.round(number)))
          if (next !== play.number) edit({ ...play, number: next }, 'number')
        },

        toggleTag(tag) {
          const { play } = get()
          const clean = normalizeTag(tag)
          if (!clean) return
          const tags = play.tags.includes(clean) ? play.tags.filter((t) => t !== clean) : [...play.tags, clean]
          edit({ ...play, tags })
        },

        renamePlaybook(name) {
          if (name !== get().playbookName) set({ playbookName: name })
        },

        loadPlaybook(playbook) {
          const plays = playbook.plays.length > 0 ? playbook.plays : [blankPlay([])]
          set({
            playbookId: playbook.id,
            playbookName: playbook.name,
            rules: playbook.rules,
            wristCoach: playbook.wristCoach,
            hydrated: true,
          })
          show(sortPlays(plays)[0], plays)
        },

        startFreehand(playerId, kind = 'route') {
          const { play, rules } = get()
          if (!playerIn(play, playerId)) return
          if (kind === 'qbRunIfBlitzed' && !qbBlitzRunAllowed(rules)) return
          const slot = slotOf(kind)
          const existing = getAssignment(play, playerId, slot)
          const fresh = withAssignment(play, {
            ...(slot === 'main' ? carryOver(existing, kind === 'route') : {}),
            playerId,
            kind,
            routeName: 'custom',
            path: [],
          })
          // Redrawing a motion pulls the player's other paths back to their lineup spot until it has points.
          edit(slot === 'motion' ? refitRoutes(fresh, rules) : fresh)
          set({ drawingFor: playerId, drawingSlot: slot, selectedId: playerId })
        },

        addWaypoint(at) {
          const { play, rules, drawingFor, drawingSlot } = get()
          const player = playerIn(play, drawingFor)
          const assignment = drawingFor ? getAssignment(play, drawingFor, drawingSlot) : undefined
          if (!player || !assignment) return

          // Motion happens before the snap, so it stays behind the line of scrimmage.
          const spot =
            assignment.kind === 'motion' ? lineupSpot(at, play.ballOn, rules) : waypointSpot(at, play.ballOn, rules)
          const origin = pathOrigin(play, player, assignment)
          const point = { x: spot.x - origin.x, y: spot.y - origin.y }
          const last = assignment.path[assignment.path.length - 1] ?? { x: 0, y: 0 }
          if (point.x === last.x && point.y === last.y) return

          const next = withAssignment(play, { ...assignment, path: [...assignment.path, point] })
          // A longer motion moves where the player's route starts.
          edit(assignment.kind === 'motion' ? refitRoutes(next, rules) : next)
        },

        stopFreehand() {
          const { play, drawingFor, drawingSlot } = get()
          if (!drawingFor) return
          set({ drawingFor: null, drawingSlot: 'main' })
          // A freehand path with no waypoints is not a path.
          const assignment = getAssignment(play, drawingFor, drawingSlot)
          if (assignment && assignment.path.length === 0) edit(withoutAssignment(play, drawingFor, drawingSlot))
        },
      }
    },
    {
      partialize: (state) => ({ play: state.play }),
      // Selection, drawing mode, and rules changes are not edits to the play, so they add no undo step.
      equality: (past, current) => past.play === current.play,
      limit: 200,
    },
  ),
)

// Keep the playbook's copy of the open play in step with every edit, undo, and redo.
useEditor.subscribe((state) => {
  const index = state.plays.findIndex((p) => p.id === state.play.id)
  if (index >= 0 && state.plays[index] !== state.play) {
    useEditor.setState({ plays: state.plays.map((p, i) => (i === index ? state.play : p)) })
  }
})

/** The whole playbook as it is saved and exported. */
export const toPlaybook = (state: EditorState): Playbook => ({
  id: state.playbookId,
  name: state.playbookName,
  rules: state.rules,
  plays: state.plays,
  wristCoach: state.wristCoach,
  schemaVersion: 1,
})

/** Ends a coalesced run, so the next change starts a new undo step. Call when a slider is released. */
export const endCoalescing = () => {
  coalesceKey = null
}

export const undo = () => {
  coalesceKey = null
  useEditor.temporal.getState().undo()
}

export const redo = () => {
  coalesceKey = null
  useEditor.temporal.getState().redo()
}

/** For tests and "new play": a fresh play with empty history. */
export function resetEditor() {
  coalesceKey = null
  const play = initialPlay()
  useEditor.setState({
    play,
    plays: [play],
    playbookId: crypto.randomUUID(),
    playbookName: 'My Playbook',
    wristCoach: DEFAULT_WRIST_COACH,
    hydrated: false,
    saveStatus: 'saved',
    rules: DEFAULT_RULES,
    selectedId: null,
    drawingFor: null,
    drawingSlot: 'main',
  })
  useEditor.temporal.getState().clear()
}
