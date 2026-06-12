# Plan: surface-paint polish bridges

Two small follow-ons to the surface-paint work (ADR-0048 and ADR-0056), the
last loose ends of the editor-experience makeover's paint slice. Neither adds a
gated capability. Each is one red-green-blue cycle plus thin wiring.

## Item C: select a wall, default the active surface to its face

Today a user picks a surface to paint from the panel list. This adds a second
route: selecting exactly one wall on the plan canvas sets the active surface to
that wall's first face, so clicking a wall on the plan chooses what to paint, not
only the right-panel list.

- Cycle (pure): a function `wallFaceForSelection(selectedIds)` that returns the
  `wall-face` `SurfaceRef` for the wall when the selection is exactly one wall
  node, and null otherwise (zero, several, or a non-wall selection). It reads the
  wall node id prefix and the first face side. Tested in isolation.
  - Allowed files: the new module and its test under `editor/`.
- Wiring (`build:`): a hook that reads the selection and the surface-selection
  store and applies the derived surface when it changes, mounted in the shell
  where both stores are in scope.

## Item B: tint the room fills by the active floor's paint

The floor surface treatment is one paint for the whole floor. When it is set, the
derived room fills on that floor show that color rather than the default tint, so
a painted floor reads on the plan.

- Cycle (pure rendering): `drawRoom` takes an optional floor fill color and uses
  it in place of the default room fill when present. The selected-room tint still
  wins for a selected room.
  - Allowed files: `editor/plan/draw-plan.ts` and its test.
- Wiring (`build:`): the plan layer resolves the active floor's solid floor
  treatment to a color and passes it through, so a floor paint dispatch repaints
  the room fills.

If the floor-tint geometry turns out ambiguous in practice, item B is deferred and
item C ships on its own.

## Gate before the pull request

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- Build, then the full chromium e2e tree (the edit-color journey must stay green).
- No schema change, so `pnpm schema:check` is not required.
