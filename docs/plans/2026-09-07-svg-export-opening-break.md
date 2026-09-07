# Break the exported wall stroke at openings

Issue #661. Carries the geometric break the 2D canvas took in issue #521 over to the SVG plan
export, and retires the opaque gap rectangle the exporter still paints.

## Where this stands today

`core/export/svg/svg-plan-exporter.ts` draws a wall the way the canvas used to: one `<line>` per
wall scene node, from projected start to projected end, stroked at `effectiveWallThickness(wall)`
with a round linecap. A stroke has no interior, so there is nothing to interrupt where an opening
cuts through. `renderOpening` works around that by filling the opening footprint with an opaque
white `<polygon>` before it strokes the two jamb caps.

That workaround has the defect ADR-0160's 2026-09-07 update describes. One opaque color can only
match one backdrop. The export paints rooms first, then walls, then openings, so a door in an
interior wall lands a white tab over the room fill on both sides of the wall. Anything the export
grows underneath later, a hatch, a floor finish, an underlay trace, would be covered the same way.

The canvas fixed this by cutting the openings out of the wall symbol rather than painting over it.
`wallFaceGeometry` in `core/geometry/wall-face.ts` takes a run, its corners, and the spans its
openings cut, and returns the stretches of standing material. `editor/plan/draw-plan.ts` and
`editor/plan/draw-surface-paint.ts` both compose it. The exporter does not.

## What changes

### 1. A wall exports as one line per standing stretch

`renderWalls` keeps emitting `<line>` elements stroked at the assembly thickness, and keeps the
`data-node-id` that ties each one back to its wall node. What changes is how many it emits: one per
stretch of wall the openings leave standing, in order from the wall's start. A wall with a door in
the middle exports two lines instead of one, and both carry the same wall node id, because they are
two pieces of the same wall.

The span arithmetic is not rewritten here. `wallFaceGeometry` already clamps a span to its run,
orders it, merges it with its overlapping neighbours, and drops the degenerate stretches that a
span meeting an end leaves behind. The exporter composes it. Because the exported wall is a stroked
centerline rather than a poche filled between two drawn faces, the run it hands over carries the
centerline itself as both faces: `aPlus` and `aMinus` are the wall's start, `bPlus` and `bMinus`
its end. Each returned stretch then carries the centerline sub-segment as `plusFace`, which is
exactly the pair of endpoints the `<line>` needs.

### 2. A cut end caps square

A round linecap extends the ink half a stroke width past the endpoint. On a wall stroked at its
full thickness that is half the wall's thickness of dark ink bulging into the doorway at each jamb,
which is the cover-up this change exists to remove, only rounded. So a stretch that a cut bounds
strokes with `stroke-linecap: butt` and stops square at the jamb, matching the perpendicular cut
ADR-0160 decision 4 describes.

A stretch that still reaches both of its wall's own endpoints keeps the round cap it has today. The
round cap is doing real work there: the exporter draws each authored wall end to end with no
mitring, so the rounded ends are what fill the notch where two walls meet at a corner. A wall with
no openings therefore exports byte for byte what it exports today.

### 3. The gap polygon goes

`renderOpening` drops `openingGap` and emits only its two jamb caps. The `OPENING_GAP` color
constant goes with it. Nothing replaces the fill: the break is geometric now, so the room fill, and
whatever else the export later paints beneath a wall, reads through the doorway.

## The projection, and why it is not shared with the editor

Both wall layers on the canvas ask where an opening cuts a wall, and they read one helper,
`editor/plan/opening-spans.ts`. The exporter asks the same question and cannot read that helper:
`core/` does not import from `editor/`, and this slice does not touch `editor/`.

The helper is also not a wrapper around anything core exports today. It is built from
`openingJambs` and `projectPointOntoWall`, both of which live in `editor/plan/opening-geometry.ts`.
So the exporter carries its own projection, kept private to the exporter module and written from
`core/geometry/vector`. It is a filter by host wall id plus a scalar projection of each jamb onto
the wall axis, under a dozen lines, and lifting it into a shared core module would need a
`core/index.ts` export to be reachable from `editor/` at all. Unifying the two is worth its own
cycle once something else in `core/` needs the answer.

The two callers differ in one way worth noting. The canvas projects onto a graph edge, so an
opening hosted by another sub-edge of a teed wall clamps away downstream. The exporter has no wall
graph and projects onto the authored wall, so every opening it filters in is already in range.

## What stays put

- The wall stroke width, and its resolution through `effectiveWallThickness`.
- The jamb caps: two across-wall `<line>`s in the opening ink, spanning the host thickness at each
  jamb, inside a group carrying the opening node id.
- The layer order in `export`: rooms, walls, openings, room labels, dimensions.
- Every color other than the retired gap fill.
- Determinism. The stretches come back in order from the wall's start, so equal projects still
  yield byte-identical SVG.

## Out of scope

- Porting the canvas poche and its two face lines to the export. The exported wall is still a
  stroked centerline. Issue #661 asks for the break, not the drafting symbol.
- The per-family opening glyph the export still defers.
- Mitred corners in the export.

## Commit sequence

`pnpm rgb:audit` reads `test:` as RED, `feat:` and `fix:` as GREEN, `refactor:` as BLUE. Every
GREEN is closed by a BLUE before the next RED.

1. `docs: plan the exported wall-stroke break at openings`
2. `test: expect an exported wall stroke to stop at each opening jamb`
3. `fix: break the exported wall stroke at its openings`
4. `refactor: <closing commit for the break, empty marker if nothing is found>`
5. `test: expect an exported opening to leave the plan beneath it unpainted`
6. `fix: stop painting a gap over an exported opening`
7. `refactor: <closing commit for the gap removal, empty marker if nothing is found>`
8. `docs: record the exported gap fill's retirement in the wall poche decision`

The break lands before the removal on purpose. Removing the fill first would leave an intermediate
commit whose export paints a solid wall straight across every door. With the break first, the
intermediate state carries a redundant gap over an already broken wall, which is the same state
ADR-0160 decision 4 left the canvas in.

Step 5 rewrites the existing `breaks the host wall with an opening gap polygon` case, since the
behavior it pins is the behavior being removed.

## How the tests read the export

The suite parses `result.content` with `DOMParser` and queries the resulting document, so a case
asserts against real SVG elements rather than a string.

- The wall break: export `createSingleOpeningProject`, whose 4000 mm wall carries one centered
  door. Two `<line>`s carry `data-node-id="wall:wall-a"`, one running from the projected wall start
  to the projected start jamb and one from the projected end jamb to the projected wall end.
  Neither crosses the opening.
- The square cut: those two lines carry `stroke-linecap="butt"`, while the wall in
  `createSingleWallProject`, which has no opening, keeps `round`.
- The retired fill: the exported document for the single-opening fixture carries no `<polygon>` at
  all, and the group carrying the opening node id carries none either. That fixture derives no
  room, so every polygon it used to emit was the gap.
- The jamb caps and the opening group id are already pinned and stay green untouched.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and
`pnpm rgb:audit origin/main..HEAD`, each checked for its own exit code, plus the SVG export suite
run on its own. No committed visual baseline renders an exported plan, so none needs refreshing.
