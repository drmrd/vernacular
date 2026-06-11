# Endpoint Re-editing Journey (characterization)

> A characterization slice: the capability already exists and works; this proves it
> from the assembled editor and makes it an enforced requirement. No product code.

**Goal:** Flip `edit-endpoint` to `required` with a journey that drives the existing
endpoint re-editing through the real editor. The second capability of the
wall-drawing-completion slice.

**Background:** Selecting a wall under the select tool arms its endpoint handles and a
drag dispatches the existing undoable `moveWallEndpoint` command. The interaction is
fully implemented in `editor/plan/use-wall-editing.ts` and wired into the plan
(`usePlanLayers`), but no journey proved it was reachable, so the capability sat
`pending`. (Because `useFitToContent` only fits on the fit key, not on every wall
change, the drawn endpoint keeps its screen position, so a deterministic drag journey
is possible.)

**The journey** (`e2e/tests/journeys/edit-endpoint.spec.ts`, title
"re-edits a wall endpoint after placement"): draw a wall, select it through its plan
proxy, drag the placed endpoint to a new position with the mouse, and assert the wall
remains but its accessible label (which carries the length) changed. Verified passing
in chromium.

**Done when:** the journey is committed, `edit-endpoint` is `required`, and the full
chain plus `pnpm integration:audit` (7 required / 4 pending) and `pnpm rgb:audit` are
clean. The journey commit is `test(e2e):` (a characterization of existing behavior,
no red-green-blue feature cycle).

**Still pending in the wall-drawing slice:** chained polyline + smart angle snap,
along-wall snapping (`snap-along-wall`), and the opening-host guard
(`opening-host-guard`).
