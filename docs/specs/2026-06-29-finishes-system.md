# Finishes system: floor, interior wall, and exterior wall finishes

Status: draft for owner ratification (autonomously authored, 2026-06-29).
Epic: #208. Children: #377 (floor, done), #378 (interior wall), #379 (exterior wall types and cladding).
Architecture decision: ADR-0130.

## Purpose

The model carries geometry but not the materials on its surfaces. A finishes system
describes what a building is actually made of, inside and out, and keeps that description as
project data so it drives both the 2D plan and the 3D model. This spec covers the three
slices of the epic (floor finishes, interior wall finishes, exterior wall types and cladding
finishes), how they reuse the existing paint model rather than duplicating it, and how the
foundational floor slice generalizes into the seam the two wall slices build on.

This is a design and decomposition document. It writes no implementation. It records the
shapes the system reuses, the one extension it needs, and the two cross-cutting open
questions, with resolutions.

## What already exists

The finishes system does not start from nothing. It sits on a paint foundation that several
prior slices already shipped.

- The surface paint model (ADR-0048, ADR-0056). A `SurfaceRef` addresses a paintable
  surface (`core/model/paint.ts`): a `wall-face` with a `wallId` and a geometric `side`
  (`left` or `right`) plus an optional `region`, a `floor` with a `floorId`, or a `ceiling`
  with a `floorId`. A `SurfaceTreatment` discriminated union holds what is applied. The
  store is `project.paint`, keyed by a derivation-independent `surfaceKey`. `resolveSurfacePaint`
  reads it.
- The treatment union has two built variants today: `{ kind: 'solid'; color; finishId }` and
  `{ kind: 'pattern'; patternId; scale; colors }`. A third variant, `{ kind: 'tiled-image';
  assetRef; repeatMm; rotationDeg }`, is reserved in ADR-0056 and is not built yet.
- 2D rendering of paint on the plan (a color band along a wall face, a floor fill) and 3D
  rendering through a material provider (`engine/materials/paint-material-provider.ts`) that
  keys a material by surface and reads `resolveSurfacePaint` (ADR-0067).
- Per-room floor color and a 3D-selectable floor surface (#205, closed).
- Floor wearing-surface finishes (#377, closed; PR #385). This is the first material-backed
  treatment: a floor-pattern registry (`core/registries/floor-patterns.ts`) of wood plank,
  ceramic tile, and parquet, mapped to the `pattern` treatment variant, resolved through
  `resolveSurfacePaint`, drawn on the 2D floor fill and the 3D floor surface, and exposed in
  the floor finish picker (`editor/plan/room-finish-section.tsx`).
- The sheen finish registry (`core/registries/finishes.ts`): flat through gloss, mapping a
  `finishId` to roughness, sheen, and specular.
- Wall construction profiles as registry data (#365 groundwork): `core/registries/construction-profiles.ts`
  and `core/scene/construction-profile.ts`. A profile is the layered structural assembly of a
  wall (framing system plus ordered material layers, interior face to exterior face) with a
  total thickness the 2D wall symbol reads and the 3D wall builder will read.
- Period trim profiles as registry data (#364 groundwork): `core/registries/trim-profiles.ts`
  and `core/scene/trim-profile.ts`. Wall and ceiling feature records (paneling, beadboard,
  coffers, beams, medallions) are the part of #364 that is not built yet.
- Topological exterior-wall derivation: `core/scene/exterior-walls.ts` returns each exterior
  wall paired with the unit `outwardNormal` toward the building outside. A wall is exterior
  when exactly one of its two faces sits inside a room.

So the floor slice of this epic is delivered. This spec treats it as the proven seam and
specifies the two remaining slices against it.

## The material-treatment seam

The floor slice proved a general shape. Naming it is most of the design work for the rest.

A finish is a `SurfaceTreatment` placed on a `SurfaceRef` in `project.paint`. A material
finish (a wood floor, a wallpaper, a brick cladding) is a non-solid treatment variant whose
`patternId` (or, later, `assetRef`) names a registry entry that carries the material
parameters and the colors or image the surface is drawn in. The same four moving parts repeat
for every surface:

1. A registry of materials for that surface family (ADR-0006), each entry an `id` plus
   material parameters (colors, repeat scale, roughness, and, for an image-backed material, a
   content-addressed asset reference).
2. A `SurfaceTreatment` variant that names a registry entry. `pattern` for procedurally drawn
   materials (planks, tile grids, brick bonds); `tiled-image` for photographic materials.
3. `resolveSurfacePaint`, unchanged, reads the treatment off the surface.
4. The 2D plan and the 3D material provider read the treatment and the registry entry and
   render it; the editor exposes a picker.

The floor slice is the first instance: the floor-pattern registry, the `pattern` variant, the
floor fill and floor surface, the floor finish picker. The interior-wall and exterior-wall
slices are the second and third instances of the same shape on different surfaces and
registries. Nothing about the store, the key, the resolver, or the schema changes between
instances. This is the reuse the epic asks for: one treatment model, several registries, not
several parallel mechanisms.

One generalization the wall slices need that the floor slice did not. The 3D material
provider resolves a `pattern` treatment's `patternId` against the floor-pattern registry
directly (`patternParameters` in `engine/materials/paint-material-provider.ts` calls
`getEntry(builtinFloorPatterns, ...)`). For a wall finish or a cladding to render, the
provider must resolve a `patternId` against the right registry. The fix is a registry-aware
material lookup: a single resolver that finds a `patternId` across the floor, interior-wall,
and cladding registries, or a `SurfaceTreatmentRegistry` keyed by treatment kind as ADR-0056
reserved. Ids stay unique across the merged registries (`mergeRegistries` already exists), or
the treatment carries the registry namespace. This is a small engine-and-core change the
interior-wall slice owns, since it is the first to need a non-floor `pattern`.

## Relationship to #205

#205 (per-room floor color and texture, closed) and #377 (floor wearing-surface finishes,
closed) are one coherent floor-treatment flow, not two parallel features. #205 shipped the
`solid` treatment and the 3D-selectable floor surface. #377 added material finishes on that
same `floor` `SurfaceRef`, through the same `project.paint` store, as the `pattern` variant.
The finishes system is the generalization of #205's color-or-texture into the
`SurfaceTreatment` union: a solid color is one variant, a material finish is another, both on
the same surface and store. The wall slices follow the same rule. No surface gets two finish
mechanisms.

## Floor finishes (delivered)

Floor finishes are #377, shipped. This spec records them as the reference instance of the
seam and does not re-specify them. The only floor follow-up this spec names is the shared
`tiled-image` variant (photographic wood or stone), which is the reserved-but-unbuilt
treatment variant and is described under cross-cutting work below.

## Interior wall finishes (#378)

Apply material finishes to interior wall faces: wallpaper, painted or stained surfaces,
flat coverings. The target is the room-facing `wall-face` `SurfaceRef`, which already exists
and is already paintable.

- Reuse the non-solid treatment variants built by the floor slice (`pattern`, and
  `tiled-image` once built). A wallpaper is a `pattern` (a repeating drawn motif) or a
  `tiled-image` (a photographic repeat); a flat covering is `solid`.
- Add an interior-wall-finish registry (ADR-0006) where wall materials differ from floor
  materials. Wall and floor registries stay separate so a wall material list is not polluted
  by floor wearing surfaces and the reverse.
- Render on the 2D plan wall band and the 3D wall face, both of which already read
  `resolveSurfacePaint`. Expose the wall finish in the paint panel picker alongside color and
  sheen.
- Use the existing `region` seam on `wall-face` for banded treatments. A wall face split into
  a lower band and an upper band is two regions; each carries its own treatment. This is how
  a wainscoted wall composes with a finish above it (see open question 1).

### Open question 1: wall covering finish versus modeled paneling feature

#364 models paneling, beadboard, and wainscot as wall features. #378 asks whether a
finish-driven wall covering (for example wallpaper) is distinct from a modeled paneling
feature, or whether they compose, so the same thing is not represented two ways.

Resolution: they are distinct representations on different axes, and they compose.

- A finish is a `SurfaceTreatment` on a `wall-face` `SurfaceRef`. It has no geometry and no
  thickness. It tints or textures the face. Wallpaper, a painted color, and a flat covering
  are finishes. This is the finishes system's job.
- Paneling, beadboard, wainscot, coffers, and beams are modeled features (#364). They carry
  profile geometry (raised panels, bead spacing, rails and stiles, a wainscot height, a
  moulded cap) and stand proud of the wall plane. They are geometry, not a finish. This is
  the old-house vocabulary track's job.
- They compose two ways. First, by region: a wainscot feature occupies the lower band of a
  wall, and the wall area above it (its upper `region`) carries a wallpaper or paint finish.
  Second, by surface: a feature's own faces are surfaces that carry finishes, so paneling can
  be painted or stained, and a wainscot's panels can carry a different finish from the wall
  above. A finish never produces geometry, and a feature never replaces a finish; a feature is
  a host whose surfaces and surrounding regions take finishes.

This keeps a single rule: geometry lives in features, color and texture live in finishes. A
wall with a painted wainscot below and a papered wall above is a wainscot feature, a finish on
the wainscot's surfaces, and a finish on the upper face region. None of it is represented
twice.

## Exterior wall types and cladding finishes (#379)

This is the largest slice and introduces a cladding concept the model does not have. Exterior
wall type drives much of how a building reads from outside: stucco, brick in various bonds,
clapboard or shingle siding, board and batten.

### Exterior-face addressing

A cladding finish attaches to the outermost face of an exterior wall. The `wall-face`
`SurfaceRef` already addresses both faces of every wall by geometric `side` (`left` and
`right`), and the paint panel already lists both. So a new `SurfaceRef` variant is not
required to address the exterior face. The gap is semantic, not structural: nothing today
identifies which side of a given exterior wall is the outside, or presents that side as a
cladding target.

Resolution: address the exterior face as the `wall-face` ref whose `side` faces outward, and
derive which side that is from the existing topological derivation. `exteriorWalls`
(`core/scene/exterior-walls.ts`) already returns each exterior wall's `outwardNormal`; a small
helper maps that normal to the wall's `left` or `right` side and yields the exterior
`wall-face` ref. Cladding is then a `SurfaceTreatment` on that ref, stored and resolved like
any other finish. No change to `SurfaceRef`, `surfaceKey`, the store, or the schema. This
matches the address-level reuse posture ADR-0056 set when it added `region`: the address is
reused, the geometry and presentation are layered on.

Two consequences to coordinate with ADR-0056. The store stays keyed by the geometric `side`,
which is derivation-independent, and exterior-ness is recomputed at render and edit time, so an
edit that changes the topology (adding a room on the far side of a wall, so the wall stops
being exterior) reclassifies the face without rewriting the stored key. And an interior
partition has a room on both faces, so it has no exterior face and takes no cladding; only the
walls `exteriorWalls` returns are cladding targets.

The literal framing in #379 ("extend the `wall-face` `SurfaceRef` to address the outermost
exterior face") is satisfied by this derivation rather than by a new type member, because the
type already addresses both faces. If a future need arises to address a cladding plane that is
not one of the two structural faces (a rain screen offset from the wall, a separate furring
layer), that would warrant a new address; it is out of scope here.

### Cladding as a finish, not a wall element type

#379 asks whether exterior wall type is a property of the wall element type, its construction
profile (#365), a surface treatment, or a combination.

Resolution: a combination, split along the structure-versus-surface seam the model already
draws. It is not a new wall element type.

- The structural wall type is the construction profile (#365). A `ConstructionProfile` already
  describes the assembly: the framing system (platform frame, balloon frame, solid masonry)
  and the ordered material layers from interior face to exterior face. This says what the wall
  is built of. The construction profile is the right home for "is this a solid brick bearing
  wall or a wood-framed wall," because that is a structural fact with a thickness and layers.
- The visible cladding (stucco, siding, brick veneer, board and batten) is a
  `SurfaceTreatment` on the exterior `wall-face`, backed by a cladding registry (ADR-0006).
  This says what the outside is finished in. Brick bonds (running, English, Flemish,
  Flemish cross, header, stack) are `pattern` data: a bond is a `pattern` treatment whose
  registry entry encodes the bond layout and the brick and mortar colors. A photographic
  stucco or siding is a `tiled-image` treatment once that variant is built.
- The two combine to describe real walls without redundancy. A solid brick bearing wall is a
  `solid-masonry` construction profile whose exterior face carries an exposed-brick cladding
  finish (a brick-bond `pattern`), or a stucco-over-brick finish. A wood-framed wall with
  brick veneer is a framed construction profile whose exterior face carries a brick-bond
  cladding finish. The structural truth and the visible finish are stored once each, in the
  place that owns them.

A heavyweight wall element type (the way an opening references an `ElementType`) is not
introduced. Walls stay bare geometry (`Wall { id, start, end, thickness }`). Structure is a
construction-profile reference, which #365 owns adding to the wall model. Finish is a treatment
in the paint store. Adding a third home for "wall type" would re-store data the profile and the
finish already hold.

### Rendering

Render the cladding on the 2D plan (a hatch or band on the exterior face of the wall symbol,
read from the exterior `wall-face` treatment) and on the 3D exterior wall face (through the
material provider, once it resolves non-floor `pattern` ids per the seam generalization
above). Brick-bond pattern drawing and photographic cladding can land incrementally; the
addressing, the registry, and the store are the durable part.

## Cross-cutting concerns

- core purity. All finish data is plain TypeScript in `core/`: registries, the treatment
  union, the resolver, the exterior-face derivation helper. No React and no Three.js in
  `core/`. The engine owns the Three.js material; the bridge wires selection; the editor owns
  the pickers.
- Project data drives both views. Every finish is a treatment in `project.paint`, which both
  the 2D plan and the 3D model read. There is no view-only finish state.
- Content-addressed assets. The `tiled-image` variant's `assetRef` is content-addressed
  (invariant 4), as ADR-0056 already specified. Image-backed cladding and wallpaper reuse the
  asset pipeline; they do not introduce a new asset path.
- Schema. The `pattern` variant already ships, so wall and cladding finishes that reuse it add
  no schema change; they are new registry entries and new treatments on existing surfaces.
  Building the `tiled-image` variant is additive to the union and needs no migration, because
  unpainted surfaces stay unpainted and existing treatments keep their shape.
- Registries. Floor, interior-wall, and cladding finishes are separate registries so each
  surface family lists only its own materials. The 3D material lookup resolves a `patternId`
  across them (merged, or namespaced) so one provider renders all three.

## The `tiled-image` shared enabler

Photographic wallpaper (#378) and photographic stucco or siding and a brick photo texture
(#379) all want the `tiled-image` treatment variant, which ADR-0056 reserved and which no
slice has built. It is a shared enabler rather than a slice of its own. The recommended
sequencing is to build it inside whichever wall slice first needs a photographic material
(most likely #378 for wallpaper), against the content-addressed asset pipeline, and let the
other slice reuse it. If the owner prefers to track it as its own follow-up issue, this spec
flags it as a candidate; it is not filed here, to avoid pre-committing the owner to a slice
boundary the wall work may set differently.

## Sequencing and decomposition

- Floor finishes (#377): done. Proves the material-treatment seam.
- Interior wall finishes (#378): next. Reuses the seam on the room-facing `wall-face`, adds
  the interior-wall-finish registry, and generalizes the 3D material lookup to resolve
  non-floor `pattern` ids. Resolves open question 1 as above.
- Exterior wall types and cladding (#379): after #378. Adds exterior-face addressing by
  derivation, the cladding registry, and brick-bond pattern data. Resolves open question 2 as
  above. Coordinates with #365 (the wall's construction-profile reference) and #364 (features).
- 3D renderings of the remaining old-house vocabulary (#380): a separate track, gated on its
  2D data counterparts (#364 trim and feature data, #365 construction profiles). Not part of
  the finishes seam; listed here because the wall slices touch the same surfaces.

## Open questions resolved

1. Wall covering versus paneling feature (#378). Distinct, and they compose. A covering is a
   finish (a `SurfaceTreatment`, no geometry); paneling and wainscot are modeled features
   (#364, geometry). Finishes apply to a feature's own surfaces and to the face regions around
   it.
2. Exterior wall type (#379). A combination. Structure is the construction profile (#365);
   the visible cladding is a registry-backed `SurfaceTreatment` on the exterior `wall-face`,
   reusing the floor seam's `pattern` and `tiled-image` variants. No new wall element type.

## Out of scope

- The wall and ceiling feature records of #364 (paneling, beadboard, coffers, beams,
  medallions). The finishes system composes with them but does not build them.
- The 3D renderings tracked by #380.
- Adding the construction-profile reference to the wall model, which #365 owns.
- A bay and bow window feature (noted in #380), unrelated to finishes.
