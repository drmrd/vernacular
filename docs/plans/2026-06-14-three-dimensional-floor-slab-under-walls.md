# Plan: floor slab reaches the outer wall faces (#124)

Spec: `docs/specs/2026-06-14-three-dimensional-floor-slab-under-walls.md`
ADR: `ADR-0076-three-dimensional-floor-slab-under-walls`
Branch: `feat/floor-slab-extends-under-walls` (off origin/main, worktree ../vernacular-pan)

## Summary

The slab is built from `clearPolygon` (centerline inset inward by each wall's
half-thickness = inner faces). Add the mirror boundary (centerline OUTSET outward
by the same half-thicknesses = outer faces) and have the slab read it. Ceiling
stays on `clearPolygon`. Purely additive, derived, no model/schema change.

## Design

- Pure `outsetPolygon(polygon, edgeOffsets)` in `core/geometry/polygon.ts` =
  `insetPolygon(polygon, edgeOffsets.map((o) => -o))`. Named for direction so the
  sign trick is not a reader's puzzle. Inherits insetPolygon's mitered corner.
- `Room.outerPolygon: Point[]` (required; only built in deriveRooms/mergeOverride).
  `deriveRooms`: `outerPolygon = outsetPolygon(polygon, edgeOffsets)` beside
  `clearPolygon`. `mergeOverride` customPolygon branch: `merged.outerPolygon =
[...override.customPolygon]` (mirrors the clearPolygon copy).
- `RoomSceneNode.outerPolygon?: Point[]` (optional; ~15 hand-built literals omit it,
  mirrors `holes?`/`ceilingHeight?`). `deriveRoomNodesForFloor` maps it across with
  the same `...(room.outerPolygon !== undefined && { outerPolygon: ... })` spread
  guard the other optional fields use (exactOptionalPropertyTypes). Since deriveRooms
  always sets it, the spread is effectively always present for derived nodes.
- `engine/scene/room-builder.ts`: split the slab boundary from the ceiling boundary.
  Slab cap+sides from `node.outerPolygon ?? node.clearPolygon`; ceiling keeps
  `node.clearPolygon`. Holes (`node.holes`) unchanged for both. Refactor
  `roomCapGeometry(node)` -> `roomCapGeometry(boundary, holes)` (or add a boundary
  param) so the two consumers pass different outer loops; keep the `top->{kind:'floor'}`
  ref tagging on the slab.

## Cycles (each test -> feat -> refactor, committed from main thread)

### Cycle 1 (core/geometry, pure): outsetPolygon

- RED (test-author; ALLOWED: `core/geometry/polygon.test.ts` only): mirror the
  insetPolygon cases. (a) outsets a CCW rectangle uniformly outward by a uniform
  offset (e.g. offset 50 on a 0..1000 square -> -50..1050); (b) outsets each edge by
  its own offset when offsets differ; (c) winding-independent like insetPolygon.
- GREEN (implementer; ALLOWED: `core/geometry/polygon.ts` only): the one-liner.
- BLUE: reviewer + refactorer (`core/geometry/polygon.ts`); doc comment paralleling
  insetPolygon. Empty marker if nothing actionable.

### Cycle 2 (core/topology, pure): Room.outerPolygon

- RED (test-author; ALLOWED: `core/topology/rooms.test.ts` only): a rectangle of
  walls of known thickness -> `room.outerPolygon` is the outer rectangle (larger than
  clearPolygon by the wall thickness; equivalently centerline +/- half-thickness);
  and `mergeOverride` with a customPolygon sets `outerPolygon` to the custom polygon
  (mirror the existing clearPolygon override assertion).
- GREEN (implementer; ALLOWED: `core/topology/rooms.ts` only): add the field + the
  deriveRooms call + the mergeOverride branch. Watch: importing outsetPolygon from
  `../geometry/polygon`.
- BLUE: reviewer + refactorer (`core/topology/rooms.ts`). Doc the field mirroring
  clearPolygon's doc ("outset outward ... outer wall faces / gross area").

### Cycle 3 (core/scene): RoomSceneNode.outerPolygon

- RED (test-author; ALLOWED: `core/scene/scene-graph.test.ts` only): a derived room
  node carries `outerPolygon` equal to the room's outer boundary. Check no existing
  full-object toEqual on a derived room node breaks (none found at audit time; the
  room assertions are field-access toEqual).
- GREEN (implementer; ALLOWED: `core/scene/scene-graph.ts` only): add the optional
  field + the spread-guarded map in deriveRoomNodesForFloor.
- BLUE: reviewer + refactorer (`core/scene/scene-graph.ts`). Doc the optional field
  mirroring holes?/ceilingHeight? (optional because hand-built literals omit it;
  builder supplies the clearPolygon fallback).

### Cycle 4 (engine): slab reads outerPolygon, ceiling keeps clear

- RED (test-author; ALLOWED: `engine/scene/room-builder.test.ts` only): build a room
  shell whose node has outerPolygon (outer rect) distinct from clearPolygon (inner
  rect). Assert (a) the slab mesh's top-cap position bounds span the OUTER rect;
  (b) the ceiling mesh's position bounds span the CLEAR rect; (c) a node WITHOUT
  outerPolygon falls back to clearPolygon for the slab. Use readPositions / AABB from
  engine/testing.
- GREEN (implementer; ALLOWED: `engine/scene/room-builder.ts` only): thread the slab
  boundary; keep the ceiling on clearPolygon.
- BLUE: reviewer + refactorer (`engine/scene/room-builder.ts`). roomCapGeometry takes
  the boundary; dedupe.

### Cycle 5 (visual tier, test(e2e)): refreshed scene-webgl baseline

- Orchestrator (not a subagent cycle): give the harness fixture room an explicit
  outerPolygon (its 4-wall rectangle offset out by the wall half-thickness) in
  `bridge/react/scene-harness-view.tsx`; refresh the affected scene-webgl baselines
  with `--update-snapshots=all` in the scene-webgl project. Commit as `test(e2e):`
  (audit-exempt). Confirm by eye the slab now reaches the wall outer faces.

## Gate (in ../vernacular-pan)

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`
- `pnpm rgb:audit` (origin/main..HEAD clean: each cycle test->feat->refactor)
- e2e: chromium project + scene-webgl project (rebuild + kill stale 4173 first)
- Real commit times. PR -> wait CI -> merge --merge -> re-detach worktree -> roadmap flip PR.

## Notes / deferred

- Holes still cut at the contained room's centerline ring (slice-2 approximation);
  nested-room outer-boundary holes deferred (spec section 4).
- outsetPolygon inherits insetPolygon's mitered corner; bevel/round join deferred.
- Toolbar-above-canvas top offset (from #123) still a separate chrome item; not here.
- 7b wall-paint left/right convention still unconfirmed (leave it).
