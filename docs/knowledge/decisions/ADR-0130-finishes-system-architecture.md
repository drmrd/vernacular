---
slug: decisions/ADR-0130-finishes-system-architecture
title: 'ADR-0130: Finishes system architecture: one treatment seam for floor, interior wall, and exterior cladding finishes'
type: decision
tags:
  [
    architecture,
    core,
    engine,
    paint,
    finishes,
    surface-ref,
    surface-treatment,
    registries,
    cladding,
    exterior-walls,
    construction-profiles,
    old-house-vocabulary,
  ]
related:
  [
    decisions/ADR-0056-surface-paint-selection-and-treatments,
    decisions/ADR-0048-paint-color-palette-and-site-metadata,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0029-schema-registry-migration-framework,
  ]
sourceFiles:
  [
    docs/specs/2026-06-29-finishes-system.md,
    core/model/paint.ts,
    core/paint/resolve-surface-paint.ts,
    core/paint/paintable-surfaces.ts,
    core/registries/floor-patterns.ts,
    core/registries/finishes.ts,
    core/registries/construction-profiles.ts,
    core/registries/trim-profiles.ts,
    core/scene/exterior-walls.ts,
    core/scene/construction-profile.ts,
    engine/materials/paint-material-provider.ts,
    editor/plan/room-finish-section.tsx,
  ]
status: proposed
updated: 2026-06-29
---

# ADR-0130: Finishes system architecture

## Status

Proposed on 2026-06-29, from the finishes epic (#208) and its children
(#377 floor, #378 interior wall, #379 exterior wall types and cladding). It awaits owner
ratification before it is treated as accepted. It records the architecture of the finishes
system: the seam reuse, the exterior-face addressing decision, the floor-first sequencing
already realized, and the two cross-cutting open questions, resolved. The full design is in
`docs/specs/2026-06-29-finishes-system.md`.

## Context

The model carries geometry but not surface materials. The epic asks for a finishes system in
three slices: floor finishes, interior wall finishes, and exterior wall types and cladding
finishes, kept as project data so they drive both the 2D plan and the 3D model.

The paint foundation this builds on already exists. ADR-0048 shipped the `SurfaceRef`
addressing scheme, the `project.paint` store keyed by `surfaceKey`, and `resolveSurfacePaint`.
ADR-0056 generalized stored paint into a `SurfaceTreatment` discriminated union and reserved
two non-solid variants, `pattern` and `tiled-image`, for material finishes. ADR-0067 rendered
treatments in 3D through a surface-keyed material provider.

The floor slice of this epic has already landed (#377, PR #385). It built the floor-pattern
registry (`core/registries/floor-patterns.ts`) and wired the `pattern` variant end to end:
resolved through `resolveSurfacePaint`, drawn on the 2D floor fill and the 3D floor surface,
and exposed in the floor finish picker. So the foundational material-treatment slice the two
wall children declare a dependency on is delivered, not pending.

Two adjacent tracks supply structure the exterior slice coordinates with. Wall construction
profiles (#365) already exist as registry data (`core/registries/construction-profiles.ts`):
a profile is the layered structural assembly of a wall, framing system plus ordered material
layers from interior face to exterior face. Period trim profiles (#364) exist as registry data
(`core/registries/trim-profiles.ts`); the wall and ceiling feature records of #364 (paneling,
beadboard, coffers, beams, medallions) are not built yet. Exterior walls are already derived
topologically (`core/scene/exterior-walls.ts`), each paired with the unit `outwardNormal`
toward the building outside.

## Decision

### One treatment seam, several registries

A finish is a `SurfaceTreatment` placed on a `SurfaceRef` in `project.paint`. A material
finish is a non-solid variant whose `patternId` (or, later, `assetRef`) names a registry entry
carrying the material parameters and the colors or image the surface is drawn in. Every
surface family reuses the same four parts: a registry of its materials (ADR-0006), a treatment
variant that names a registry entry (`pattern` for drawn materials, `tiled-image` for
photographic ones), the unchanged `resolveSurfacePaint`, and the existing 2D and 3D rendering
plus a picker. The floor slice is the first instance. Interior wall finishes and exterior
cladding are the second and third instances of the same shape on different surfaces and
registries. The store, the key, the resolver, and the schema do not change between instances.
We reuse the paint model; we do not build a parallel finishes mechanism.

The floor color-or-texture feature (#205) and the floor wearing-surface finishes (#377) are
one coherent floor-treatment flow on the `floor` `SurfaceRef`: solid color is the `solid`
variant, a material finish is the `pattern` variant, both on the same surface and store. The
wall slices follow the same rule, so no surface gets two finish mechanisms.

### Exterior-face addressing reuses the existing `wall-face` ref

The `wall-face` `SurfaceRef` already addresses both faces of every wall by geometric `side`
(`left` and `right`), so addressing the outermost exterior face needs no new `SurfaceRef`
variant or member. The gap is semantic: nothing identifies which side of an exterior wall is
the outside or presents it as a cladding target. The decision is to address the exterior face
as the `wall-face` ref whose `side` faces outward, and to derive that side from the existing
`exteriorWalls` derivation (map its `outwardNormal` to the wall's `left` or `right`). Cladding
is then a `SurfaceTreatment` on that ref, stored and resolved like any other finish, with no
change to `SurfaceRef`, `surfaceKey`, the store, or the schema. This is the address-level reuse
posture ADR-0056 took when it added `region`. The store stays keyed by the derivation-independent
geometric side; exterior-ness is recomputed at render and edit time, so a topology edit that
reclassifies a wall does not rewrite stored keys. Interior partitions have a room on both faces,
so they have no exterior face and take no cladding.

This deliberately reads the literal "extend the `wall-face` `SurfaceRef`" framing of #379 as
satisfied by derivation rather than by a new type member, because the type already addresses
both faces. A genuinely new address (a cladding plane offset from the structural face, a rain
screen) is deferred until something needs it.

### The 3D material lookup becomes registry-aware

The 3D material provider resolves a `pattern` treatment's `patternId` against the floor-pattern
registry directly (`engine/materials/paint-material-provider.ts`). To render wall and cladding
patterns, the provider must resolve a `patternId` against the right registry: a single
registry-aware lookup across the floor, interior-wall, and cladding registries (merged with the
existing `mergeRegistries`, or namespaced), or the per-kind `SurfaceTreatmentRegistry` ADR-0056
reserved. The interior-wall slice owns this change, since it is the first to need a non-floor
`pattern`.

### Floor-first sequencing

Floor finishes (#377) are delivered and prove the seam. Interior wall finishes (#378) come
next, reusing the seam on the room-facing `wall-face`, adding the interior-wall-finish
registry, and generalizing the material lookup. Exterior wall types and cladding (#379) follow,
adding exterior-face addressing by derivation, the cladding registry, and brick-bond pattern
data, and coordinating with #365 and #364. The 3D renderings of the remaining old-house
vocabulary (#380) are a separate track gated on #364 and #365, not part of this seam.

### Open question 1: wall covering finish versus paneling feature (#378)

Resolved: distinct representations on different axes that compose. A covering (wallpaper, a
painted or flat surface) is a `SurfaceTreatment` on a `wall-face` ref, with no geometry.
Paneling, beadboard, wainscot, coffers, and beams are modeled features (#364) that carry
profile geometry and stand proud of the wall. They compose by region (a wainscot occupies the
lower band; the upper `region` of the face carries a paper or paint finish) and by surface (a
feature's own faces take finishes, so paneling can be painted or stained). One rule: geometry
lives in features, color and texture live in finishes, and neither is represented twice.

### Open question 2: exterior wall type (#379)

Resolved: a combination split along the structure-versus-surface seam, not a new wall element
type. The structural wall type is the construction profile (#365), which already describes the
framing system and the layered assembly. The visible cladding (stucco, siding, brick veneer,
board and batten) is a registry-backed `SurfaceTreatment` on the exterior `wall-face`; brick
bonds are `pattern` data, and photographic claddings are `tiled-image`. The two combine to
describe both a solid brick bearing wall (a masonry profile with an exposed-brick or stucco
cladding finish) and a framed wall with brick veneer (a framed profile with a brick-bond
cladding finish). Each stores the structural truth and the visible finish once. Walls stay
bare geometry; the construction-profile reference is #365's to add, and the finish lives in the
paint store.

## Alternatives considered

- A new `SurfaceRef` variant or member for the exterior face. Rejected. The `wall-face` ref
  already addresses both geometric faces, so a new address would duplicate a face that is
  already reachable and would split exterior cladding off the store and key that already serve
  it. Derivation from `exteriorWalls` gives the same result without reshaping the model.
- A wall element type that owns "wall type" (mirroring how an opening references an
  `ElementType`). Rejected. It would re-store data the construction profile (structure) and the
  cladding finish (surface) already hold. That makes a third home for the same facts and a
  reconciliation burden between them.
- Modeling wallpaper as a thin paneling-style feature, or modeling paneling as a finish.
  Rejected. Collapsing geometry and surface color onto one axis either gives a covering a false
  thickness or strips a feature of its profile. Keeping them distinct and composable is the
  rule that lets a papered wall above a painted wainscot exist without representing anything
  twice.
- Filing the floor-finishes slice as a new foundational issue. Not done. It is already filed and
  completed (#377, PR #385); filing it again would duplicate a closed issue.
- A standalone `tiled-image` enabler issue. Deferred to the owner. The variant is a shared
  enabler for photographic wallpaper and cladding; the spec recommends building it inside the
  first wall slice that needs it rather than pre-committing a slice boundary.

## Consequences

- The two wall slices are reuse, not redesign: a registry, a treatment variant already typed,
  and the existing store, resolver, 2D and 3D rendering, and pickers. The one genuinely new
  core or engine change is the registry-aware material lookup.
- No schema change for `pattern`-based wall and cladding finishes, because the variant already
  ships. Building `tiled-image` is additive to the union and needs no migration.
- Exterior cladding rides the existing paint store and exterior-wall derivation, so an edit that
  changes which walls are exterior reclassifies cladding targets without rewriting stored keys.
- The finishes system composes with the old-house vocabulary track (#364 features, #365
  profiles, #380 renderings) without absorbing it. Finishes own color and texture; features and
  profiles own geometry and structure.
- This ADR is `proposed`. The floor slice it describes is already accepted in code; the interior
  and exterior decisions await owner ratification before the wall slices build against them.

## References

- `docs/specs/2026-06-29-finishes-system.md`, the full design.
- [[ADR-0056-surface-paint-selection-and-treatments]], the treatment union and the `SurfaceRef`
  address-level seams this reuses.
- [[ADR-0048-paint-color-palette-and-site-metadata]], the paint foundation and the registry of
  finishes.
- [[ADR-0067-three-dimensional-painted-preview]], the 3D material seam this extends to
  registry-aware lookup.
- [[ADR-0006-registry-pattern]], the registry pattern each finish family follows.
- [[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]], the old-house vocabulary track the
  exterior slice coordinates with.
- [[ADR-0029-schema-registry-migration-framework]], the migration framework no `pattern`-based
  finish needs and the `tiled-image` variant will not need.
- Issues #208 (epic), #377 (floor, done), #378 (interior wall), #379 (exterior cladding), and
  the coordinating #205, #364, #365, #380.
