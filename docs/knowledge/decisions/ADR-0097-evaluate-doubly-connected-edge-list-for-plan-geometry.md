---
slug: decisions/ADR-0097-evaluate-doubly-connected-edge-list-for-plan-geometry
title: 'ADR-0097: Evaluate a doubly-connected edge list for plan geometry'
type: decision
tags: [architecture, core, geometry, topology, rooms, junctions, dcel, half-edge, evaluation]
related:
  [
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0058-donut-and-courtyard-rooms-via-hole-rings,
    decisions/ADR-0080-generalized-wall-junction-geometry,
    decisions/ADR-0082-three-dimensional-wall-junction-fill,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    core/topology/wall-graph.ts,
    core/topology/rooms.ts,
    core/topology/junction-fill.ts,
    core/topology/wall-footprint.ts,
    core/topology/opening-edge.ts,
    core/scene/scene-graph-deriver.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0097: Evaluate a doubly-connected edge list for plan geometry

## Status

Accepted. This ADR is an evaluation, and the decision it records is the
recommendation itself: defer adopting a doubly-connected edge list (DCEL) now, and
revisit when curved walls (issue #80) or courtyard and atrium spaces (issue #78) are
scheduled. No production code, schema, or test changes accompany it. Issue #269 asked
for a decision record, not a commitment to build, and this is that record.

## Context

The plan's topology lives entirely in `core/topology/`, and it is derived rather than
stored. `buildWallGraph` (`core/topology/wall-graph.ts`) nodes the raw walls into a
`PlanarGraph`, which is two flat arrays: `vertices: Point[]` and `edges: GraphEdge[]`,
where a `GraphEdge` is the undirected triple `{ a, b, wallId }`. Adjacency between
edges is implicit. Every consumer that needs to know which edges meet at a vertex
recomputes that fan from the arrays. `deriveRooms` (`core/topology/rooms.ts`) then
enumerates the bounded faces of that graph, the planar-face walk ADR-0026 describes.

The question comes up now because the next two geometry features stress this
representation more than anything we ship today. Curved and non-linear walls (#80)
break the assumption that an edge is a straight segment, which the noding, the angle
sort, and the footprint miter all lean on. Courtyards and atria (#78) are exactly the
multiply-connected faces that ADR-0058 already had to bolt a containment pass onto.
Both features push on face traversal and hole nesting, which is where a half-edge
structure earns its keep. So this is the right moment to write down whether a DCEL is
worth its cost, and if so, when.

## The current representation and its limits

A DCEL stores, for each directed half-edge, a pointer to its twin (the same edge in
the other direction), its next half-edge around a face, and the face it bounds. Faces
become first-class records. Today none of those pointers persist. What we have instead:

- **The graph is undirected and adjacency is implicit.** `PlanarGraph` is vertices
  plus undirected edges. `buildWallGraph` nodes the arrangement in three passes: an
  endpoint merge within a 1 mm tolerance, interior X-crossing registration, and
  T-junction edge splitting, all scanning pairs of walls. The merge and crossing
  passes are O(n^2) in wall count. The result has no notion of "the edge to my left as
  I walk this face."

- **Half-edge semantics already exist, but only informally and only for the length of
  one call.** `deriveRooms` builds a minimal `HalfEdge` (`{ from, to, wallId }`) with
  no twin or next field stored on it. It groups outgoing half-edges per vertex and
  sorts each group by leaving angle (`outgoingByVertex`), then walks faces by computing
  each step's successor on the fly: `nextHalfEdge` finds the twin by reversed endpoints
  plus a matching `wallId`, looks it up in the head vertex's angle-sorted group, and
  takes the clockwise-previous entry. That is the standard planar-subdivision face rule.
  But the twin, the next, and the face are all recomputed inside the walk and thrown
  away when it ends. There is no persistent face record. The faces are transient arrays
  of half-edges, and the rooms they become carry only a polygon, an area, and a bounding
  wall-id set. So the conceptual machinery of a DCEL is already here in spirit; it is
  just rebuilt from scratch every time and never written down.

- **Several derived facts arrive through separate post-passes rather than from the
  structure.** Holes are not found during the walk. ADR-0058 added `assignHoles`, a
  containment pass that runs after the faces become candidate rooms, tests which room
  sits inside which, marks the inner ring as a hole, and subtracts its area. In a DCEL
  a hole is a native concept, an inner boundary component of a face, and would not need
  a separate containment test. Wall thickness geometry comes from two independent passes
  that read the same vertex fans without sharing them: `wallFootprints`
  (`core/topology/wall-footprint.ts`, via `vertexIncidence` and `resolveVertex`) and
  `junctionFills` (`core/topology/junction-fill.ts`, via `corePolygon`). The wedge
  resolution is duplicated across the two files, and nothing structural ties a wall's
  corner to the fill that closes the gap beside it. The two passes agree only because
  they both reread ADR-0080's fan resolution, as ADR-0082 spells out. And opening
  placement is a linear scan: `resolveOpeningEdge` (`core/topology/opening-edge.ts`)
  walks the edge list to find the one containing the opening's center, matching
  `edge.wallId` to the opening's `hostWallId` by string, not by a structural pointer
  from opening to edge.

- **Nothing is serialized, and the whole thing rebuilds per dispatch.** A `Floor` stores
  walls, openings, dimensions, furniture, and underlays. It stores no topology, and the
  current schema records none. Rooms, footprints, and fills are always derived on demand.
  The scene-graph deriver (`core/scene/scene-graph-deriver.ts`) memoizes a floor's room
  nodes by the `floor.walls` array reference, so any wall edit invalidates the whole
  floor's rooms, footprints, and fills and they rebuild together. An opening-only edit
  reuses them. The derived-and-never-stored property is a real strength: there is no
  stored geometry to drift out of sync with the walls (ADR-0026), and the immutable
  update discipline (ADR-0018) needs no extra bookkeeping.

## What a DCEL would buy us

Make the half-edge structure explicit and persistent and several of the fragmented
pieces above collapse into one:

- **Twin, next, and face become stored pointers** instead of being recomputed in the
  room walk. Face traversal reads `next` directly. The twin lookup stops being a
  reverse-endpoint search with a `wallId` tiebreak.

- **Multiply-connected faces are native.** A face with inner boundary components holds
  its holes directly, so a courtyard or a free-standing inner mass is part of the face
  record rather than a fact recovered by a containment post-pass. The `assignHoles` pass
  ADR-0058 added could retire. This matters most for #78, where courtyards are the point.

- **One fan traversal feeds everything that reads a vertex fan.** Footprints, junction
  fills, and the room walk all want the angularly-sorted edges around a vertex. A DCEL
  computes that once and the consumers share it, instead of `wall-footprint.ts` and
  `junction-fill.ts` each rebuilding it and duplicating the wedge math.

- **Edge-to-wall and opening-to-edge become structural links** rather than `wallId`
  string matches and linear scans. An opening could point at the half-edge it sits on.

- **It opens a path to incremental invalidation.** Today a single wall edit rebuilds the
  whole floor's topology. A persistent structure with adjacency could update only the
  faces and fills incident to the edited wall and leave the rest in place, which is the
  shape issue #166 explored for incremental scene updates. The full per-dispatch rebuild
  is fine at today's wall counts, but it does not stay free as plans grow.

- **It holds up better where the next features push.** Curved walls (#80) and courtyards
  (#78) are exactly the cases that strain face traversal and hole nesting, and a
  structure built around faces and adjacency handles them with fewer special cases than
  layering more post-passes onto the flat-array walk.

## Costs and cons

The adopt-now case has to answer for real costs:

- **A persistent structure tempts statefulness, and the current model is purely derived.**
  The strongest property of today's topology is that it is a pure function of the walls,
  rebuilt on demand and never stored. A DCEL is most valuable when it persists across
  edits and updates incrementally, which is precisely the property that puts it in
  tension with the immutable-update discipline (ADR-0018) and the derived-not-serialized
  stance (ADR-0026). Keeping a DCEL consistent under `dispatch(command)` without letting
  it become a second, mutable source of truth that can drift from the walls is the hard
  part, and getting it wrong reintroduces the drift the derived model was designed to
  rule out.

- **It is a migration of a correct, well-tested system.** ADR-0026, ADR-0058, ADR-0080,
  and ADR-0082 each ship with unit tests and, for the 3D work, pixel baselines. Porting
  room derivation, hole assignment, footprints, and fills onto a DCEL means re-validating
  all of that behavior and refreshing the baselines, for an outcome the current code
  already produces correctly.

- **More code to maintain, for a system that works.** A DCEL builder, its invariants,
  and its consistency checks are a meaningful surface to add and keep correct, against a
  flat-array pipeline that is small and understood.

- **The noding cost is not what a DCEL fixes.** The O(n^2) endpoint merge and crossing
  registration in `buildWallGraph` are the part most likely to bite at scale, and they
  sit before any half-edge structure exists. A DCEL improves traversal and adjacency,
  not the arrangement noding, so it is not the answer to the one quadratic pass. A
  spatial index behind the same `buildWallGraph` signature is the lever there, and it is
  independent of this question.

## Decision drivers

- **Robustness under the next features.** #80 and #78 are where the flat-array walk and
  the containment post-pass strain hardest. They are the events that would justify the
  structure.
- **Appetite for incremental updates.** A persistent DCEL is the natural home for #166's
  incremental invalidation. Without a concrete need for that, the full rebuild is fine.
- **The cost of the current duplication.** Two passes rereading the same fans and
  duplicating wedge math is real but contained, and the passes already share one source
  of truth through ADR-0080's fan resolution.
- **Preserving the derived-not-serialized property.** This is a strength worth keeping,
  and any DCEL adoption must not quietly trade it for a stateful cache.
- **Team bandwidth.** Issue #269 is priority:low and sized XL. The full adoption is the
  XL; the evaluation is small. Spending the XL now, ahead of the features that motivate
  it, is poor sequencing.

## Recommendation

Defer adopting a DCEL. Revisit when issue #80 (curved and non-linear walls) or issue
#78 (courtyards and atria) is scheduled, because those are the features that actually
stress face traversal and hole nesting, and they are when the structure stops being
speculative.

Treat the existing informal half-edge walk in `rooms.ts` as the seam. The twin-by-wallId
lookup, the angle-sorted outgoing fan, and the implicit next-pointer are already the
core of a DCEL; they are just transient. When a DCEL does land, it would make that
machinery explicit and persistent, which means it extends ADR-0026 rather than replacing
it, likely subsumes ADR-0058's hole containment pass into native inner boundary
components, and unifies the ADR-0080 footprint fan and the ADR-0082 fill fan behind one
shared traversal. It is an evolution of the current pipeline, not a rewrite.

When #80 or #78 starts, a sensible trigger deliverable is a time-boxed spike: port room
derivation to an explicit DCEL face walk on a throwaway branch and measure it against the
current enumeration. Success criteria worth holding it to are a measurable drop in
special-case post-passes (the hole containment pass folding into faces, the two fan
passes sharing one traversal) and a credible path to incremental invalidation, without
giving up the derived-not-serialized property. If the spike does not clear that bar, the
flat-array pipeline stays.

## Consequences

- **If deferred, nothing changes in code.** The topology pipeline stays as it is. This
  ADR is the durable reasoning trail so a future session reaching for a DCEL does not
  re-litigate the trade-off from zero, and so the trigger conditions are written down.

- **The adopt path is scoped in advance.** A future adoption would touch
  `core/topology/wall-graph.ts` (the graph it builds on), `core/topology/rooms.ts` (the
  face walk and hole assignment), `core/topology/wall-footprint.ts` and
  `core/topology/junction-fill.ts` (the shared fan), `core/topology/opening-edge.ts`
  (the structural opening-to-edge link), and the memoization in
  `core/scene/scene-graph-deriver.ts` (where incremental invalidation would land). It
  would also extend ADR-0026 and revisit ADR-0058, ADR-0080, and ADR-0082, whose
  `related` fields now point back here so the connection is discoverable from either end.

- **The derived-not-serialized property is the line not to cross.** Any adoption keeps
  topology a pure function of the walls. A DCEL that becomes a stored, mutable second
  source of truth would forfeit the strength that motivated deriving rooms in the first
  place, and that is the failure mode the spike's success criteria guard against.

## References

- ADR-0026 (room derivation via planar-face enumeration; a DCEL would make its informal
  half-edge walk explicit and extend it).
- ADR-0058 (donut and courtyard rooms via hole rings; native inner boundary components
  would subsume its containment post-pass).
- ADR-0080 (generalized wall-junction geometry; its fan resolution is one of the two
  passes a shared DCEL traversal would unify).
- ADR-0082 (three-dimensional wall-junction fill; the second fan pass, kept in agreement
  with the footprint pass only by rereading the same fan resolution).
- ADR-0018 (scene-graph derivation; the immutable-update discipline a persistent DCEL
  must not undercut).
- ADR-0001 (six-layer architecture; this stays pure `core/` work, no React, Three.js, or
  DOM).
- Issue #80 (curved and non-linear walls) and issue #78 (courtyards and atria): the
  trigger features the recommendation hangs on.
- Issue #166 (incremental scene updates): the incremental-invalidation appetite a
  persistent structure would serve.
