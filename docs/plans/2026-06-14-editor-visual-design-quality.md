# Editor visual-design-quality pass: implementation plan

Goal: close the warmth, depth, and craft gap in the editor shell within the approved
Draughtsman's Restraint language, per `docs/specs/2026-06-14-editor-visual-design-quality.md`,
via small red-green-blue cycles on `feat/editor-visual-design-quality`.

Approach: test first. Each cycle writes or adjusts a failing test (red), adds the minimal
implementation (green), reviews and refactors while green (blue), then commits. No new
dependencies, no em-dashes, Conventional Commits, separate test/feat/refactor commits.

Commands: focused test `pnpm exec vitest run <file>`; `pnpm typecheck`; `pnpm lint`.

## The canvas pipeline (where the palette threads in)

`plan-view.tsx` builds a `PlanScene` (`buildScene`) and calls `usePlanRedraw(canvasRef, scene)`
(`plan-scene.ts`), which assembles `DrawPlanOptions` (`buildDrawOptions`) and calls
`drawPlan(ctx, options)` (`draw-plan.ts`). `draw-plan.ts` and `ruler.ts` hardcode cool colors
today. The palette is resolved from CSS custom properties in `plan-view.tsx` (theme reactive)
and threaded into `drawPlan` through the options.

## Canvas-palette work (the spec's cycle 1; implement first, then capture a before/after)

### Cycle 1: canvas-role tokens and the PlanPalette resolver

Files: modify `editor/design-system/tokens.css`; create `editor/plan/plan-palette.ts` and
`editor/plan/plan-palette.test.ts`.

- Tokens (light theme): add `--color-canvas-grid`, `--color-canvas-wall`,
  `--color-canvas-room-fill`, `--color-canvas-ruler-band`, `--color-canvas-ruler-tick`,
  `--color-canvas-ruler-text`, and `--color-canvas-selection`, mapped to warm vellum, umber,
  and brass: grid a low-contrast warm vellum, wall umber-900, room fill a warm light vellum,
  ruler band a vellum surface, ticks and text umber-muted, selection brass-500. Dark-theme
  values are deferred to the dark-canvas pass.
- `PlanPalette` type (grid, wall, roomFill, rulerBand, rulerTick, rulerText, selection), plus
  `resolvePlanPalette(readVar: (name: string) => string): PlanPalette` that maps the tokens,
  and `DEFAULT_PLAN_PALETTE` of warm fallbacks for when a var reads empty.
- Red: `resolvePlanPalette` maps injected token values to the palette fields and falls back to
  the defaults for empty reads. Expect fail.
- Green: implement the type, resolver, and defaults.
- Blue: review; commit.

### Cycle 2: drawPlan and ruler read the palette

Files: modify `editor/plan/draw-plan.ts` and `editor/plan/ruler.ts`; tests in
`editor/plan/draw-plan.test.ts` (create if absent) and `editor/plan/ruler.test.ts`.

- Add `palette: PlanPalette` to `DrawPlanOptions`. `drawGrid`, the wall stroke, the default
  room fill, and the selection stroke read `options.palette` instead of `GRID_LINE_COLOR`,
  `WALL_COLOR`, `ROOM_FILL_COLOR`, and the `SELECTED_*` blues. `drawRulers` takes the band,
  tick, and text colors from the palette.
- Red: with a recording mock `PlanDrawingContext`, assert `drawGrid` sets `strokeStyle` to
  `palette.grid`, the wall stroke to `palette.wall`, the room fill to `palette.roomFill`, and
  the selection stroke to `palette.selection`; and `drawRulers` paints the band, ticks, and
  text in the palette colors. Expect fail.
- Green: replace the constants with palette reads.
- Blue: remove the now-dead cool constants; commit.

### Cycle 3: resolve the palette and thread it through the redraw

Files: modify `editor/plan/plan-scene.ts` (`buildDrawOptions` and `usePlanRedraw` take the
palette) and `editor/plan/plan-view.tsx` (resolve from CSS vars, re-resolved on theme change).

- `usePlanRedraw(canvasRef, scene, palette)`; `buildDrawOptions(scene, palette)` sets
  `options.palette`. In `plan-view.tsx`, resolve once with
  `resolvePlanPalette((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim())`,
  memoized on the resolved theme so a theme switch re-resolves and redraws.
- Red: `buildDrawOptions` includes the passed palette in its returned options. Expect fail.
- Green: thread it through; add the resolved theme to the redraw dependencies.
- Blue: commit.
- ADR: record the canvas-reads-tokens decision under `docs/knowledge/decisions/`, since the
  canvas now sources color from semantic tokens.
- Then: capture a before/after of the canvas with headless Playwright and show the owner. This
  is the first review checkpoint.

## Remaining spec cycles (after the owner reviews the canvas before/after)

### Cycle 4: surface layering and depth

Files: `editor/design-system/tokens.css` and the rail, inspector, and app-frame styles.

- Establish three warm surface roles so the canvas, panels, and raised elements separate (map
  the panels a step deeper than the canvas, keep raised elements lightest, add a hairline warm
  border or low elevation). Tune the vellum semantic mapping, do not add a raw palette.
- Red: a token test asserting the panel and canvas surface tokens resolve to distinct values.
  Green: re-map. Blue: commit.

### Cycle 5: brand mark

Files: a new brand-mark SVG component in `editor/shell`, mounted beside the wordmark in
`editor-shell.tsx`.

- The crosshair glyph (outer circle, inner dot, four radial ticks) in brass.
- Red: the shell renders a brand mark with an accessible name beside the wordmark. Green: add
  it. Blue: commit.

### Cycle 6: header toggle labels and density

Files: `editor-shell.tsx` and the rail and inspector CSS.

- Give the Grid and Dimensions toggles visible text labels beside their icons; tighten the
  rail and inspector spacing toward the mockup's denser rhythm.
- Red: the Grid and Dimensions toggles expose their text label. Green: add labels and adjust
  spacing. Blue: commit.

## After the cycles

- Run the full chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.
- Open a PR stacked on #155, with before/after screenshots attached to the PR description as
  uploaded images, not committed to the repo.

## Spec coverage

Decision 1 (canvas reads tokens) maps to cycles 1 through 3; decision 2 (surface depth) to
cycle 4; decision 3 (brand mark) to cycle 5; decisions 4 and 5 (header labels, density) to
cycle 6; decision 6 (brass presence) to the selection ring in cycle 2 plus the existing brass
roles.
