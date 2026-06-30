---
slug: decisions/ADR-0138-explicit-grade-elevation-field
title: 'ADR-0138: An explicit site grade elevation decouples the ground surface from the floor-zero datum'
type: decision
tags:
  [
    3d-preview,
    scene-graph,
    core,
    engine,
    bridge,
    ground,
    grade,
    foundation,
    elevation,
    schema,
    migrations,
    site,
  ]
related:
  [
    decisions/ADR-0131-ground-plane-grade-datum,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0127-whole-building-3d-view,
    decisions/ADR-0029-schema-registry-migration-framework,
  ]
sourceFiles:
  [
    docs/plans/2026-06-29-explicit-grade-elevation-field.md,
    core/model/site.ts,
    core/model/factories.ts,
    core/migrations/schema/add-site-grade-elevation.ts,
    schema/13/vernacular.schema.json,
    core/scene/scene-graph.ts,
    core/scene/scene-graph-for-floor.ts,
    bridge/react/view-scene-graph.ts,
    engine/scene/ground-plane.ts,
    engine/scene/build-scene.ts,
  ]
status: current
updated: 2026-06-29
---

# ADR-0138: An explicit site grade elevation decouples the ground surface from the floor-zero datum

## Status

Accepted, landed. A project site can now carry an explicit grade elevation, and when it does, the ground
plane and the whole-building underground filter read that elevation instead of the fixed zero datum. This
extends [[ADR-0131-ground-plane-grade-datum]], which pinned grade to elevation 0 and recorded a stored
grade field as a follow-up.

## Context

ADR-0131 seated the ground plane at a hardcoded datum of 0 and filtered below-grade floors against that
same 0. That holds as long as the finished floor of the ground storey sits exactly at grade. It breaks for
a raised foundation, where the first floor stands a few hundred millimeters above the ground, and for a
daylight basement whose finished floor is below grade but whose site still has its own ground level. In
those cases the drafter has no way to say where the ground is, so a partly buried basement reads as either
fully buried or fully exposed, and the lawn cuts the building at the wrong height.

The datum the ground needs and the datum the floors are placed against are two different things. Floor
placement measures every storey from the finished-floor-zero of the ground floor, and ADR-0127 leans on
that ordering for the underground filter. Grade is a property of the site the building sits on. Conflating
the two was convenient while grade was fixed, but it is exactly the conflation ADR-0131 flagged that an
explicit field would have to undo.

The open questions were where the field belongs, how it reaches the two readers (the engine ground plane
and the bridge underground filter), and how a saved project that predates the field keeps loading.

## Decision

### Grade is site metadata, defaulting to the zero datum

`Site` gains an optional `gradeElevation?: number` in millimeters. Absent, it means the 0 datum, so the
field changes nothing for a project that does not set it and ADR-0131's behavior is preserved. A pure
resolver, `resolveGradeElevation(site?)`, returns the site value when present and
`DEFAULT_GRADE_ELEVATION_MM` (0) otherwise, so every reader shares one fallback rule and no caller repeats
the nullish check.

Grade lives on the site rather than on a floor or at the top of the project because it describes the ground
the whole building sits on, not any one storey. A per-floor grade would have no clear meaning for a stacked
model, and a bare top-level number would sit apart from the site metadata it belongs with.

### The resolved grade rides the scene graph

`deriveSceneGraph` resolves the site grade once and writes it onto a new optional
`SceneGraph.gradeElevation`, omitting it from hand-built graphs so an optional field is never stored as
`undefined` (the project runs `exactOptionalPropertyTypes`). The bridge's floor and building projections,
`sceneGraphForFloor` and `sceneGraphForBuilding`, forward the field so a narrowed or filtered graph still
carries the datum its ground plane needs. The derivation owns the resolve, so both downstream readers see a
graph that already states its grade and neither re-reads the site.

### Both readers compare against the graph grade, not zero

The whole-building underground filter in `bridge/react/view-scene-graph.ts` hides floors whose elevation is
below `graph.gradeElevation` rather than below a local zero constant, so a raised first floor above a
negative grade stays visible while a true cellar below it is hidden. The engine ground plane in
`engine/scene/ground-plane.ts` takes the grade as an argument, `addGroundPlane(root, gradeElevation)`, and
seats the mesh at it; `buildScene` passes `graph.gradeElevation` through. Each reader keeps a default of 0,
so an existing `SceneGraph` literal that omits grade behaves as before, and `GRADE_ELEVATION_MM` survives
as the engine-side fallback for that case.

### Schema version 13 with a passthrough migration

The CORE JSON Schema is generated with `additionalProperties: false` and committed immutable under
`schema/<version>/`, with `pnpm schema:check` guarding drift, so the field is a versioned model change.
`CURRENT_SCHEMA_VERSION` moves from 12 to 13, `schema/13/vernacular.schema.json` is regenerated, and a
`from: 12` migration is registered. The field is optional, so a version-12 document is already valid at 13
with nothing to backfill; the migration is an identity passthrough that exists only so the framework in
[[ADR-0029-schema-registry-migration-framework]] can advance the document version. The orchestrator owns
the version stamp, so the migration leaves `meta.schemaVersion` alone.

## Consequences

- A raised foundation or a daylight basement can state where its ground actually sits, and the ground plane
  and the underground filter both honor it. A partly buried basement reads correctly because the surface
  meets the building at the stated grade.
- A project that sets no grade, and every hand-built scene-graph literal, behave exactly as under ADR-0131.
  The field is additive and its fallback is the prior fixed datum, so nothing regresses.
- Grade resolution is a pure function unit-tested without Three.js, and both readers consume the single
  derived value, so the engine and the bridge share one source of truth for the datum.
- The field expresses a single uniform grade. A site whose ground slopes, or a stepped foundation where
  exposure varies along the footprint, still cannot be modeled. That is the deferred half of ADR-0131's
  follow-up, carried forward below.

## Alternatives considered

- **Keep grade pinned to the zero datum.** This is the ADR-0131 state the change exists to undo. It cannot
  express a raised foundation or a site that does not sit at floor-zero, the cases the explicit field was
  recorded as a follow-up for.
- **A per-floor or a bare top-level grade.** Rejected because grade is a property of the site, not of any
  storey, and a per-floor value has no coherent reading for a stacked model. Placing it on `Site` keeps it
  with the metadata it belongs to.
- **A stored per-edge or per-segment exposure field.** This is the richer model that would cover a sloped
  site or a stepped foundation, where the above-grade height differs along the building. It is deferred on
  purpose: it is open-ended, it interacts with footprint geometry and with how exposure is drawn, and it is
  out of proportion to the single-datum gap this change closes. ADR-0131 listed grade and
  above-grade-exposure as alternative follow-ups; this ADR lands the grade half and leaves the exposure
  half as the named follow-up.

## References

- ADR-0131 (the fixed-datum decision this extends; its recorded grade follow-up is the half landed here,
  with per-edge exposure remaining open).
- ADR-0001 (the six-layer architecture that keeps the resolve in pure core and leaves the engine and the
  bridge as readers).
- ADR-0018 (the scene-graph derivation that now resolves and carries the grade).
- ADR-0127 (the whole-building view and its underground filter, now reading the model grade).
- ADR-0029 (the schema-and-registry migration framework the version 12 to 13 bump runs through).
- Issue #410 (explicit grade / above-grade-exposure model field). The per-edge / sloped-site /
  stepped-foundation exposure follow-up is filed at merge.
