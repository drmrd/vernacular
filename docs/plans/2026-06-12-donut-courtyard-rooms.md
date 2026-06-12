# Plan: donut and courtyard rooms in core room derivation

Slice 10 of the editor-experience makeover, and its last gated capability. The
goal is for a wall layout with a free-standing inner loop, a light well or a
chimney mass or an inner room, to derive a room that carries an interior void. The
decision and its rationale live in ADR-0058; this plan is the build order.

The work is pure-core at its heart and then threads the void outward through the
scene projection, the accessible label, and the plan fill so the gate journey can
observe it. Each cycle is a red-green-blue round: a failing test, the smallest
implementation that passes it, then a refactor marker. Every green closes with a
blue marker before the next red.

## Background already verified

- `deriveRooms` in `core/topology/rooms.ts` enumerates bounded faces and returns
  `Room` objects. A free-standing inner loop forms a second connected component, so
  it currently yields the outer interior as a solid rectangle plus the inner
  interior as its own room. The annulus and the void are not represented.
- `pointInPolygon(point, polygon)` already ships in `core/geometry/polygon.ts`. Its
  boundary rule counts a point on an edge as inside, so the containment test pairs
  vertices-inside with a disjoint-wall guard to avoid treating a shared-corner
  subdivision as an island.
- `RoomSceneNode` lives in `core/scene/scene-graph.ts`; `deriveRoomNodesForFloor`
  in `core/scene/scene-graph-deriver.ts` maps rooms to nodes and already copies the
  optional `name` only when present.
- The accessible room label is built in `editor/plan/overlay-label.ts` as
  `Room, <area>`. The plan fill is `drawRoom` in `editor/plan/draw-plan.ts`, one
  closed path filled with the floor tint.
- The journey harness exposes `selectors.roomProxies` matching `/^Room,/` and the
  chained-polyline tool closes a loop into a room by clicking back on the first
  corner. Two closed loops give an outer ring and an inner ring on one floor.

## Cycle 1: holes on the derived room

Red, then green, then blue. Pure core, no React or DOM.

- Allowed files: `core/topology/rooms.ts`, `core/topology/rooms.test.ts`.
- Behavior: `Room` gains optional `holes?: Point[][]`. `deriveRooms`, given an outer
  loop and a free-standing inner loop, returns the outer room with `holes` holding
  the inner loop's polygon, and the outer room's `area` reduced by the inner loop's
  centerline footprint. A plain layout still returns rooms with no `holes` field.
- Shape: keep the half-edge walk untouched. Build all candidate rooms first, then
  run one containment pass that assigns each contained room to its immediate
  container as a hole and subtracts the hole footprint from the container's area.
  Containment is every vertex of the inner polygon inside the outer polygon plus
  disjoint bounding-wall sets; the immediate container is the smallest containing
  room.
- Blue: extract the containment pass and the immediate-container selection into
  named pure helpers if the green step left them inline; keep functions within the
  forty-line limit. Empty marker if nothing is actionable.

## Cycle 2: project holes onto the room scene node

Red, then green, then blue.

- Allowed files: `core/scene/scene-graph.ts`, `core/scene/scene-graph-deriver.ts`,
  `core/scene/scene-graph.test.ts`.
- Behavior: `RoomSceneNode` gains optional `holes?: Point[][]`.
  `deriveRoomNodesForFloor` copies `holes` onto the node when the derived room has
  them and omits the field otherwise, mirroring the existing `name` copy under
  `exactOptionalPropertyTypes`.
- Blue: empty marker unless the copy logic wants tidying.

## Cycle 3: announce the void in the accessible label

Red, then green, then blue.

- Allowed files: `editor/plan/overlay-label.ts`, `editor/plan/overlay-label.test.ts`.
- Behavior: a room node with one hole reads `Room, <area>, with an interior void`;
  with more than one hole it reads `with N interior voids`. A room with no holes is
  unchanged. The named and unnamed room branches both gain the clause.
- Blue: factor the void clause into a small pure helper if the branch grew awkward.

## Cycle 4: cut the void out of the plan fill

Red, then green, then blue.

- Allowed files: `editor/plan/draw-plan.ts`, `editor/plan/draw-plan.test.ts`.
- Behavior: `drawRoom` appends each hole as a reverse-wound sub-path inside the same
  path before the single `fill`, so the nonzero winding rule leaves the void
  unpainted. A room with no holes draws exactly as before. The selected-room stroke
  is unaffected.
- Blue: extract a hole-path helper if `drawRoom` crossed the line limit; otherwise
  an empty marker.

## Journey and gate flip

Not a red-green-blue cycle. Committed as `test(e2e):`, which the cycle audit exempts.

- Allowed files: `e2e/tests/journeys/donut-room.spec.ts`, `e2e/journey-coverage.json`.
- The journey, titled `derives a room with an interior void`, opens the editor,
  draws an outer square loop with the chained-polyline tool, draws a smaller square
  loop well inside it, then asserts a room proxy whose accessible name contains
  `interior void`, and asserts two room proxies in total. Flip `donut-room` from
  pending to required in the coverage matrix, taking the gate to eleven required and
  none pending.

## Gate before the pull request

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- Build, then run the full e2e tree on chromium, not only the journeys folder, since
  top-level specs also draw walls.
- No schema touch in this slice, so `pnpm schema:check` is not required.
