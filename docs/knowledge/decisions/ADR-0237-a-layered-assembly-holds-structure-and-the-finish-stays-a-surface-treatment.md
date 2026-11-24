---
slug: decisions/ADR-0237-a-layered-assembly-holds-structure-and-the-finish-stays-a-surface-treatment
title: 'ADR-0237: A layered assembly holds the build-up of a wall, and the finish of a face stays a surface treatment'
type: decision
tags: [architecture, assets, taxonomy, walls, construction-profiles, finishes, registries]
related:
  [
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0137-wall-construction-profiles,
    decisions/ADR-0160-plan-wall-poche-and-face-lines,
    decisions/ADR-0219-pack-assets-carry-textures,
    decisions/ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down,
    decisions/ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters,
  ]
sourceFiles:
  [
    docs/specs/2026-11-23-asset-taxonomy.md,
    core/registries/construction-profiles.ts,
    core/scene/construction-profile.ts,
    core/model/paint.ts,
    core/model/types.ts,
  ]
status: current
updated: 2026-11-23
---

# ADR-0237: A layered assembly holds the build-up of a wall, and the finish of a face stays a surface treatment

## Status

Current, 2026-11-23. Nothing is built yet. On 2026-11-23 the owner ruled that a layered assembly
does not own the finish, and that it may suggest a default finish for each face, which the app
copies into the paint map one time, when the assembly is applied.

This record builds on ADR-0234 and ADR-0236. Both depend on ADR-0229, which is on `main`.

## Context

The taxonomy of ADR-0234 has a domain for layered assemblies, `LYR`: ordered stacks of layers for
walls, floors, roofs, paving, and ground. Its rank sits between the materials and the objects a
person places. A layered assembly could be read as the full description
of a wall, from the studs to the last coat of paint on each side.

The app already splits that description in two, and ADR-0130 says why.

- **The build-up.** A wall may name a construction profile (`Wall.constructionProfile`, ADR-0137). A
  profile is a registry entry with a structural system and an ordered list of layers, each with a
  material id and a thickness in millimeters (`core/registries/construction-profiles.ts`). The sum
  of the layers is the wall's thickness. Nothing else in a profile is used yet: no command and no
  control in the app sets a profile, and no layer is drawn on its own.
- **The finish.** The visible treatment of a face is stored in the project's paint map, keyed by
  surface, as a surface treatment: a solid color with a finish, or a pattern, with a tiled image
  reserved (`core/model/paint.ts`). A person paints one face of one wall in one room without
  touching the wall's build-up.

ADR-0130 stores each fact once. A wall with the same build-up in ten rooms has ten different papers
and paints, and they change far more often than the plaster behind them.

If a layered assembly also held the finish layers, the same fact would be stored in two places. A
person who painted a wall would either edit the project's paint map, and leave the assembly out of
date, or switch the wall to another assembly, and the library would need one assembly for every
pairing of build-up and color.

## Decision

### A layered assembly describes the build-up only

A `LYR` asset describes the layers that make up the body of a wall, in order from the interior face
to the exterior face. Each layer has a thickness in millimeters and names what it is made of. The
plaster, the board, or the sheathing that forms a face is a layer. The paint, the paper, the stain,
or the cladding color on that face is not.

A layer names its material by reference to a lower rank, as ADR-0234 requires: a substrate (`SUB`)
or a material (`MAT`). A framed layer names its studs as a profile (`PRF`) and a spacing in
millimeters. A framed layer does not reference a structure object (`STR`).

### The finish stays where ADR-0130 puts it

The visible treatment of a face stays a surface treatment in the project's paint map. ADR-0130 is
not changed. Coatings (`COT`), colors (`CLR`), patterns (`PAT`), and materials (`MAT`) are what a
surface treatment draws on.

### An assembly may suggest a default finish for each face

A `LYR` asset for a wall may carry a suggested finish for each of its two faces. A suggestion is a
surface treatment of the kind the paint map already holds, and it names its coatings, colors, or
patterns as lower-rank references.

When a person applies the assembly to a wall, the app copies each suggestion into the paint map for
that face, one time, in the same step as the application, so one undo reverses both. After the copy
the paint map holds an ordinary surface treatment and no link back to the assembly. Painting the wall
later changes the paint map only. Changing or replacing the assembly does not repaint a wall. An
assembly with no suggestion leaves the paint map alone.

This gives a period wall in one step, and the finish still has one home. The exact shape of a
suggestion is reserved, and the pull request that adds the first reader settles it.

### A layered assembly feeds the construction profile registry

The construction profile registry stays the one place the app reads a wall's build-up from. A `LYR`
asset for a wall adds an entry to that registry, in the pattern ADR-0006 describes for packs. A wall
keeps naming a profile by its registry id, and the wall's thickness keeps coming from the sum of the
layers (ADR-0137).

No second structure for the same data is added to the model.

### Floors, roofs, and ground come later

The app has construction profiles for walls only. The `LYR` subcategories for floors, roofs, paving,
and soil are named in the taxonomy, and nothing reads them. Each needs a kind of assembly in the
model first, and each gets its own decision when that work starts.

## Alternatives considered

None of these was taken.

- **No suggested finish.** It is the simplest rule. But a period wall would take two steps to
  apply, every time.
- **The layered assembly holds the finish layers too.** One asset would describe a whole wall, and a
  period wall could be dropped in complete. But the finish would be stored twice, painting one room
  would mean editing or swapping an assembly, and the library would hold one assembly for every
  pairing of build-up and finish.
- **Move the finish out of the paint map and into the assembly on each wall.** The finish would
  again be stored once, in the wall. But a wall has two faces in two rooms, and the paint map
  already has an address for each face and a reserved address for a region of a face (ADR-0130).
  Moving the finish would be a breaking change to the project schema for no gain a user sees.
- **Keep layered assemblies out of the taxonomy.** There would be nothing to reconcile. But a wall's
  build-up is the thing a period library most needs to share, and the construction profile registry
  was designed to be extended by packs.
- **A second registry for pack-supplied assemblies.** The existing registry would not change. But a
  wall would then name one of two sources, and every reader of a wall's thickness would have to look
  in both.

## Consequences

- ADR-0130 and the project's paint data stay as they are, and no project needs a migration.
- A pack can describe the walls of a period, and a wall that uses such an assembly gets its
  thickness from it.
- A pack can deliver a wall with a default finish in one asset. The finish is copied once, and a
  later change to the assembly does not reach walls that already have it.
- The material id of a layer changes from a free string to a reference into the taxonomy. The
  built-in profiles need the same change, and ADR-0137 needs an amendment when it happens.
- A project that names a profile from a pack needs that pack to resolve the thickness. Applying an
  assembly writes the profile's total into the wall's own thickness, so a wall whose pack is missing
  keeps its true thickness, and the inspector labels the profile as missing.
- No pack can add a registry entry today. The registries are constants in the code, and the
  architecture refactor makes them resolvable at run time
  (`docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5). Pack-supplied assemblies
  wait for that work.
- Amends: ADR-0137 gets a note about pack-supplied profiles and the layer's material as a taxonomy
  reference. It is a pointer note, and ADR-0130 gets none.

## What stays open

The owner ruled on these on 2026-11-23, and they are decided:

- The registry id of a profile from a pack is the serialized asset reference
  `pack:<packId>@<packVersion>#<sha256>`, resolved in the order of ADR-0007.
- A wall whose pack is absent keeps the thickness that applying the assembly wrote, and the inspector
  labels its profile as missing.
- The registry gains five structural systems beside the three it has: `timber-frame`, `plank-frame`,
  `mass-concrete`, `earthen`, and `log`. Each wall subcategory allows a stated few of them, and the
  pack tool refuses the rest.
- Applying an assembly writes a suggested finish only into a face that has no treatment.
- The interior side of a wall is derived when the assembly is applied and is never stored. A face is
  interior where a room lies on that side and exterior where none does. A partition gets the interior
  suggestion on both faces, and a face with opposed runs gets one suggestion for each part.

Still open:

- Whether the plan drawing shows the layers of an assembly. The wall poché of ADR-0160 draws one
  fill.
- Assemblies for floors, roofs, paving, and ground.

## References

- `docs/specs/2026-11-23-asset-taxonomy.md`
- `docs/plans/2026-11-23-asset-taxonomy-adoption.md`
- `docs/specs/2026-06-29-finishes-system.md`
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.5
- [[ADR-0006-registry-pattern]]
- [[ADR-0130-finishes-system-architecture]]
- [[ADR-0137-wall-construction-profiles]]
- [[ADR-0160-plan-wall-poche-and-face-lines]]
- [[ADR-0219-pack-assets-carry-textures]]
- [[ADR-0234-assets-are-classified-by-domain-and-tier-and-references-point-down]]
- [[ADR-0236-asset-contracts-are-optional-manifest-fields-in-millimeters]]
