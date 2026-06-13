# Plan: Live drag readouts (#118)

Spec: docs/specs/2026-06-13-live-drag-previews-and-readouts.md
ADR: ADR-0072

## Goal

Carry the wall-tool's live length-and-bearing readout pill to the other live
drag gestures: selection move (displacement) and wall endpoint drag (reshaped
wall length). One shared scene leaf + the existing DOM readout pill. No model
change, no command, view-only.

## Existing seams (from exploration)

- `editor/plan/draw-readout.ts`: `segmentReadout(from, to)` -> {lengthMm, bearingRad};
  `formatReadout(...)` -> string using `formatAdaptiveLength` + degrees. Wall-tool pill
  uses these today.
- `editor/plan/plan-overlay.tsx`: DOM overlay, `ReadoutChip` PositionedPill rendered from
  a `preview` field; only the wall tool sets it. `worldToScreen(point, viewport)` places it.
- `editor/plan/use-selection-move.ts`: produces `ghost` (PreviewSegment[]) via `moveDragGhost()`;
  has the press origin + current pointer during a drag. NO readout today.
- `editor/plan/use-wall-editing.ts`: produces a `preview` of the dragged endpoint; knows the
  fixed end + dragged point + which wall. NO readout today.
- `editor/plan/plan-scene.ts` (PlanScene + buildDrawOptions) + `plan-view.tsx` (usePlanLayers,
  buildScene) thread interaction state to the overlay/canvas.
- Units: `plan-view.tsx` PREFERENCES_BY_UNITS from project.units -> scene.preferences.

## Architecture

Add a pure `editor/plan/drag-readout.ts`:

- `dragReadout(anchor, from, to, preferences): { anchor: Point; text: string }` (or similar):
  computes `segmentReadout(from, to)` + `formatReadout`, returns the anchor (the live point)
  and the formatted text. Reused by both gestures. Anchor = the live cursor/dragged point.

Add a single optional `readout?: { anchor: Point; text: string }` leaf to the PlanScene /
overlay path (parallel to the existing `preview`-driven wall pill, or unify wall-draw onto it
in the BLUE if clean). plan-overlay renders ONE positioned readout pill from it, reusing
ReadoutChip's component + CSS offset.

Each drag hook sets the leaf while active, clears on release:

- use-selection-move: readout = displacement origin -> current pointer.
- use-wall-editing: readout = fixed end -> dragged point (the grabbed wall).

## RGB cycles

### Cycle A: pure drag-readout module + move-drag displacement readout

- RED: test for `dragReadout` (or the move-readout helper): given origin + current point +
  preferences, returns the anchor at the current point and the wall-tool-form text
  (length + bearing). Plus a test that use-selection-move's drag produces a readout (pure
  helper on the move state if one exists, else cover via the hook's pure inputs).
- GREEN: implement drag-readout.ts; wire use-selection-move to emit the readout leaf; thread
  the leaf through plan-scene -> plan-overlay; render the pill.
- BLUE: clean-code-reviewer + refactorer. Close GREEN with a BLUE marker.

### Cycle B: wall endpoint-drag readout

- RED: test that the endpoint drag emits a readout for the edited wall (fixed end -> dragged
  point) at the dragged point. Pure where possible (a helper computing the segment from the
  edit state); else the hook seam.
- GREEN: wire use-wall-editing to emit the readout leaf from its existing preview state.
- BLUE: reviewer + refactorer; consider unifying the wall-draw pill onto the shared leaf if
  the dedup is clean and low-risk. Close GREEN with a BLUE marker.

### Cycle C: e2e

- RED (`test:` subject, NOT test(e2e):): e2e drags a selection and asserts the readout pill
  (`.plan-overlay__readout`) appears with the expected-ish text during the drag and clears on
  release. Use journey helpers (selectWallTool/drawWall to build a wall, select it, drag).
- GREEN/BLUE as needed (glue may already pass; if so, a green e2e is the proof and the cycle is
  test->refactor marker).

## Gate

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`;
`pnpm rgb:audit origin/main..HEAD` clean; full chromium + scene-webgl e2e after build (kill stale 4173).
Home darwin visual baseline: only refresh if the STATIC render shifts (it should not; readout is
drag-only, pointer-driven).

## Watch / gotchas

- lint-staged eslint --fix can empty a RED file whose import can't resolve yet; verify eslint-clean,
  drop leaked stashes, reformat in BLUE.
- max-lines-per-function (40) on the hooks if adding readout state inline; extract a helper.
- Adding a PlanScene field can break exact-match toEqual scene tests; sweep + use toMatchObject or
  update.
- Do NOT step on #119 (opening resize handles) or #120 (free-angle endpoint). Openings + free-angle
  are explicitly deferred.

## Defer / out of scope

- Opening drag ghost + readout -> #119.
- Free-angle endpoint modifier -> #120.
- Keyboard-nudge readout (a11y overlay already announces).
