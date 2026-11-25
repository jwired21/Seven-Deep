# 7-on-7 Play Designer

Personal 7-on-7 flag football play designer. Static single-page app, one user, no server.
`BRIEF.md` is the full spec. Read it before starting a phase. It is kept on the owner's
computer only and is left out of the repository on purpose (see `.gitignore`). Do not commit it.

## Rules

1. **Yards, not pixels, in the data model.** Everything in `src/model` and anything saved,
   exported, or passed between modules is in yards. Origin is the ball. `x` runs across the
   field (negative is left). `y` runs downfield (positive is toward the goal line).
   Pixels and PDF points exist only at draw time, produced by a transform in `src/geometry`
   (screen) or `src/pdf` (print). Never store, snap, or compare in pixels.
2. **Tests for geometry and PDF sizes.** Any change to yard/pixel conversion, field layout,
   mirroring, snapping, route templates, or rules checks ships with a Vitest test. PDF output
   is tested by reading the generated PDF back and asserting physical sizes in points
   (1 pt = 1/72 in), within 0.5 pt. See the printing spec in `BRIEF.md`.
3. **Stop for review after each phase.** Build one phase from the Build order in `BRIEF.md`,
   run `npm test` and `npm run build`, show the result, and wait for a go-ahead. Do not start
   the next phase unasked.

## League rules

The default `RulesProfile` follows the SportsLink coed 7v7 rulebook (last updated 1/1/2026):
https://docs.google.com/document/d/15JrxewWiQQD0bDb3VIQXrtZ8Fqhrx1SBG2BGPGzXPm4

- **Yards everywhere, in the model and on screen.** The rulebook gives some distances in feet.
  Convert them once with `feet()` in `src/model/defaults.ts` and show them with `formatYd()`
  (10 ft is 3⅓ yd). Never show feet as the unit on the field.
- Field: 200 ft long in total (66⅔ yd) with 25 ft end zones (8⅓ yd), so 50 yd goal line to
  goal line and midfield at the 25. The rulebook gives no width, which varies by park, so
  40 yd is assumed.
- No-run zone: 10 ft (3⅓ yd) from the goal line. Pass only when the ball is spotted inside it.
- One first down, at midfield. Drives start on the offense's own 10-foot line. The 1-point try
  is from the 10-foot line and the 2-point try from the 20-foot line.
- Blitz: 5 per game. The QB can run when blitzed or after the 5-count. Anyone pitched the ball
  before the count can run.
- No blocking or picks. Do not offer `block` as an assignment unless the profile allows it.
- Motion is legal unless it is toward the line of scrimmage at the snap.
- Coed: at most 4 males on the field. One of every three plays needs a female as the operative
  player (thrower, intended receiver, or runner). A female touchdown is worth 8 when the play
  starts outside the no-run zone.

## Conventions

- Pure logic (model, geometry, rules, PDF layout) has no React or DOM imports, so it runs in
  Node tests and can feed both the screen and the PDF.
- Screen and PDF draw from the same data model. Do not screenshot or print the DOM for PDFs.
- Rules are warnings, never blocks. Every league rule is a setting on `RulesProfile`.
- Every edit to the play goes through an action in `src/store/editorStore.ts`, and one user
  gesture is one undo step. A drag previews in local component state and commits once on
  release. A slider uses a coalesce key. Selection and rules changes are not undo steps.
- Players line up on the 1-yard grid, at least a yard behind the line of scrimmage, inside the
  sidelines. The store enforces this with `lineupSpot()`, so saved data is always legal.
- A route's `path` is offsets from the player's start, not field positions, so it travels
  with the player. Use `absolutePath()` to draw it.
- Tree routes break at a depth measured from the line of scrimmage, not from the player, and
  "outside" means toward that player's sideline. After any change that moves players or the
  ball, run `refitRoutes()`: it rebuilds tree routes from their template and keeps freehand
  routes in bounds.
- Arrowheads and dashes come from `src/geometry/path.ts`, which is unit-agnostic so the PDF
  can reuse it.
- A player has one assignment per slot: `motion`, `main` (route, run, or handoff), and `blitz`
  (QB run if blitzed). `withAssignment()` replaces within the slot. A route starts where the
  player is at the snap, `snapSpot()`: their start, or the end of their motion.
- A handoff lives on the player handing off, with `handoffTo` and no path. The exchange point
  is computed by `handoffPoint()`, not stored.
- There is no save button. `plays` in the store always holds the open play, a subscriber keeps
  it in step with every edit, undo, and redo, and `startPersistence()` writes the playbook to
  IndexedDB a moment after any change. Undo history belongs to one play and starts over when
  another play is opened.
- Everything read from storage or an import file goes through `parsePlaybook()`. It rejects
  what it cannot read with a message for the user, and fills in settings an older file lacks.
  When you add a field to the model, add it there too, with a round-trip test.
- Rule checks live in `checkPlay()` and return warnings with a stable `id`. They are computed
  from the play and the profile, never stored. A new league rule means a new check there, a
  setting on `RulesProfile`, a default, a line in `parsePlaybook()`, and a test.
- Change rules only through `setRules()`. It sanitizes every value, and when the field
  changes size it refits every play and starts undo over.
- A player's gender is a roster fact: `setGender()` applies it to that player in every play.
- Print code draws on a `Surface` (`src/pdf/surface.ts`), in points from the top left, never
  on the PDF library directly. `PdfSurface` writes the file, `SvgSurface` makes the on-screen
  preview, and `RecordingSurface` lets tests check what was drawn. Only `playbookPdf.ts` and
  `pdfSurface.ts` import the PDF library, and they are loaded on demand.
- `routeShapes()` is the one place route geometry is worked out. The designer and the PDF
  both draw from it. Do not compute arrowheads, dashes, or label spots anywhere else.
- The PDF uses no transparency: blend colors with `blend()`. It uses the built-in Helvetica,
  so text goes through `PdfSurface`, which swaps characters the font lacks (⅓ becomes 1/3).
- To prove a printed size, save the PDF and read it back with `readPdf.ts`.
- The wrist coach cut rectangle must be exactly the window size. `wristCoach.test.ts` builds
  the PDF, reads it back, and checks 324 x 162 pt, 360 x 216 pt, and the 72 pt bracket.
  Never loosen that test. Cut lines and the bracket use butt caps so they end exactly on size.
- The service worker is built only for production (`npm run build`), by vite-plugin-pwa. It
  precaches every built file, the PDF library included. To test offline, use `npm run preview`,
  never the dev server. A phone needs HTTPS to install it: localhost on a computer is fine,
  a LAN address is not.
- View mode (`src/viewer`) is read-only: `Field readOnly` attaches no drag handlers. On a
  narrow screen the app opens in view mode, and Edit opens the stacked editor.
- Flip and mirror are different. `flipPlayers()` flips a formation's strength: a player whose
  mirror spot is taken by a teammate stays put, so in Empty only the back crosses over.
  `mirrorPlayers()` is the true mirror for whole plays (phase 5), where everyone crosses.
- Tests sit next to the code as `*.test.ts(x)`.
- Install a dependency in the phase that first needs it, and confirm its current version on
  npm first. The PDF library is `@cantoo/pdf-lib`, the maintained fork of pdf-lib. All planned dependencies are now installed.
- TypeScript runs with `erasableSyntaxOnly` and `verbatimModuleSyntax`: no enums, use
  `import type` for types.
- "Seven Deep" is a placeholder app name.

## Commands

- `npm run dev` – dev server at http://localhost:5173
- `npm test` – run the tests once (`npm run test:watch` to watch)
- `npm run build` – typecheck and build to `dist/`
- `npm run preview` – serve the built app at http://localhost:4173, with the service worker
- `npm run icons` – redraw the app icons in `public/icons/` from `scripts/make-icons.mjs`

## Hosting

`.github/workflows/deploy.yml` tests, builds, and publishes `dist/` to GitHub Pages on every
push to `main`. The build uses a relative base, so it works from the repository's subpath
with no extra setting. The repository needs Settings > Pages > Source set to "GitHub Actions".

## Layout

```
src/
  model/      types and defaults, all in yards
  geometry/   yards <-> pixels transform, field layout, snap and mirror (pure, tested)
  formations/ formation templates, apply and flip (pure, tested)
  routes/     route tree templates, assignment helpers (pure, tested)
  panel/      side panel sections (React)
  library/    play list operations: new, duplicate, mirror, search, tags (pure, tested) and its panel
  rules/      rule checks and warnings, rules sanitizing (pure, tested) and the rules editor
  pdf/        print colors, the drawing surface, play diagrams, page layout, PDF output, preview
  app/        app-level state: view mode, offline status
  viewer/     full-screen view mode for flipping through plays
  storage/    IndexedDB, autosave, and the JSON export file with its validator
  store/      Zustand editor store; undo and redo through zundo
  field/      SVG field and draggable players (React)
  App.tsx     shell: top bar, field, side panel
```

Folders added by later phases: nothing new.

## Phase status

- [x] 1. Scaffold and field
- [x] 2. Players and formations
- [x] 3. Routes
- [x] 4. Run game and QB run
- [x] 5. Play library
- [x] 6. Rules profile
- [x] 7. Playbook PDF
- [x] 8. Wrist coach sheet (size test passes; still needs a real print checked against a band)
- [x] 9. Player cards
- [x] 10. iPhone and offline (works offline from the built app; still needs a real iPhone, installed from an HTTPS host, tried in airplane mode)
- [ ] 11. Playback (added by the owner on 2026-11-25, after the brief). Watch a play develop:
  a play button that can pause, and a slider to scrub back and forth. All seven players move
  along their paths at once, honoring motion and delayed releases. Click a receiver to choose
  who the ball goes to, and the football flies there. Build it after phase 10 unless told
  otherwise. Nothing in the data model needs to change first: paths are already in yards.
  It will need a speed per player or per kind, and a `passTo` on the play.
