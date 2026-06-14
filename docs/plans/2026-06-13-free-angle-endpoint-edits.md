# Free-angle modifier for wall endpoint edits: implementation plan

> Execution mode: main-thread red-green-blue with the role-separated subagents
> (test-author RED, implementer GREEN, clean-code-reviewer + refactorer BLUE). I commit
> from the main thread and stay on `feat/free-angle-endpoint-edits`. Each behavior cycle
> is test -> feat -> refactor. An end-to-end test that is a cycle's RED commits as `test:`
> so the audit sees a RED before the GREEN.

**Goal:** Carry the wall tool's held-Alt free-angle modifier to wall endpoint editing, so
dragging a selected wall's endpoint with Alt held suspends the angle lock, and the live
preview re-resolves when Alt toggles without a pointer move.

**Architecture:** The pure `angleSnap` step in `snap.ts` already returns no candidate when
the snap context carries `freeAngle`, and `useSnapping` already threads a `freeAngle` input
into the context. The only missing wiring is in the editing glue. `use-wall-editing.ts` will
track the held key with a shared hook and pass `freeAngle` into its `useSnapping` call, and a
re-resolve effect will repaint the preview on the toggle. The duplicated key-tracking effect
in `use-plan-interaction.ts` (`useFreeAngleModifier`) and the new one fold into a single
shared `useHeldAltKey(active)` hook. No core, model, or command change.

**Tech stack:** TypeScript, React, Vitest + Testing Library, Playwright.

---

## File structure

- `editor/plan/use-held-alt-key.ts` (create, BLUE of cycle 1): shared
  `useHeldAltKey(active: boolean): boolean` that tracks `event.altKey` via keydown/keyup
  while `active` and resets to `false` when inactive.
- `editor/plan/use-wall-editing.ts` (modify): call the key tracker gated on
  `selectedWall !== null`, add `freeAngle` to the `useSnapping` input, add a `lastRawCursor`
  ref recorded in the move handler, and a re-resolve effect on the `freeAngle` toggle.
- `editor/plan/use-plan-interaction.ts` (modify, BLUE of cycle 1): rewire
  `useFreeAngleModifier` onto `useHeldAltKey(tool === 'draw-wall')`.
- `e2e/tests/journeys/free-angle-endpoint.spec.ts` (create): the two behavior REDs.

No change to `snap.ts`, `use-snapping.ts`, or any core/command file: the `freeAngle` flag and
the `angleSnap` gate already exist from the smart-angle-snap slice (ADR-0054).

---

## Cycle 1: Holding Alt frees a dragged endpoint from the angle lock

**Files:** Create `e2e/tests/journeys/free-angle-endpoint.spec.ts`; modify
`editor/plan/use-wall-editing.ts`; (BLUE) create `editor/plan/use-held-alt-key.ts` and modify
`editor/plan/use-plan-interaction.ts`.

- [ ] **Step 1 (RED, test-author, commit `test:`):** Add an end-to-end test that draws a
      wall, selects it through its accessibility proxy, and drags an endpoint toward a clearly
      off-square target twice. First plainly: read the endpoint readout pill
      (`.plan-overlay__readout`) bearing, which the angle lock squares to an axis value.
      Then with `page.keyboard.down('Alt')` held across the whole drag: read the bearing
      again, which now reflects the free angle. Assert the two readout texts differ. Release
      Alt. The test fails today because endpoint editing never passes `freeAngle`, so both
      drags square to the same axis bearing.
- [ ] **Step 2 (GREEN, implementer):** In `use-wall-editing.ts`, track the held Alt key
      (a local keydown/keyup effect gated on `selectedWall !== null` is acceptable here; the
      BLUE step dedups it) and pass `freeAngle` into the existing
      `useSnapping({ walls, viewport, origin })` call. The move handler already calls
      `snapping.resolve`, so a moving drag with Alt held resolves to the free point and the
      readout reports the free bearing. Minimal change; no re-resolve yet.
- [ ] **Step 3 (BLUE, clean-code-reviewer + refactorer):** Extract the shared
      `useHeldAltKey(active)` into `editor/plan/use-held-alt-key.ts`, rewire
      `use-wall-editing.ts` to call it gated on `selectedWall !== null`, and rewire
      `useFreeAngleModifier` in `use-plan-interaction.ts` onto the shared hook with the
      draw-wall tool as its active condition. The wall-drawing free-angle behavior is
      unchanged and stays green. Commit `refactor:` (empty marker if nothing actionable).

## Cycle 2: The live preview re-resolves when Alt toggles without a pointer move

**Files:** Modify `editor/plan/use-wall-editing.ts`; extend
`e2e/tests/journeys/free-angle-endpoint.spec.ts`.

- [ ] **Step 1 (RED, test-author, commit `test:`):** Add an end-to-end test that drags an
      endpoint toward an off-square target without the modifier, reads the squared bearing
      from the readout, then presses `page.keyboard.down('Alt')` with no further pointer
      move and asserts the readout text changes to the free bearing. It fails today because
      the preview only re-resolves on a pointer move, so a key-only toggle leaves the readout
      on the squared bearing.
- [ ] **Step 2 (GREEN, implementer):** In `use-wall-editing.ts`, add a `lastRawCursor` ref,
      record the raw (pre-snap) cursor in the move handler, and add an effect keyed on the
      `freeAngle` value that, while a drag is active and a raw cursor is recorded, re-resolves
      the snap and repaints the preview. Mirror `useReresolveOnFreeAngleToggle` in
      `use-plan-interaction.ts`, including its single-dependency eslint exception.
- [ ] **Step 3 (BLUE, clean-code-reviewer + refactorer):** If `useWallEditing`'s body or the
      new effect trips `max-lines-per-function`, extract the re-resolve into a small sibling
      hook (mirroring the wall-tool helpers `useGrabHandler` / `useDragMoveHandler`). Keep the
      file under the 300-line limit. Commit `refactor:` (empty marker if nothing actionable).

---

## Verification

Per slice, after the cycles:

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit &&
pnpm build` all green. `pnpm lint` is `--max-warnings 0`, so watch `max-lines-per-function`
  on the grown `useWallEditing` and on any grown e2e describe.
- `pnpm rgb:audit origin/main..HEAD` clean (each cycle test -> feat -> refactor; the e2e RED
  commits as `test:`, and a `.spec.ts` is exempt from the test-independence rule).
- After a rebuild and killing any stale 4173, the chromium and scene-webgl Playwright suites
  pass.
- The home visual baseline is unchanged: the modifier acts only during a pointer drag, so it
  never repaints the at-rest plan.

## Out of scope (recorded follow-ups)

- A spoken "Locked to N degrees" announcement during an endpoint edit (endpoint editing has
  no angle-lock announcement today; a separate accessibility improvement).
- Routing the freed endpoint through any future snap-chain refinements.
- The slice 7b painted-wall left/right side convention remains unconfirmed and untouched.
