---
slug: decisions/ADR-0143-environment-model-foundations
title: 'ADR-0143: Environment model foundations: observation time, environment scenes, timezone, and schema versions 14 and 15'
type: decision
tags:
  [
    architecture,
    core,
    environment,
    observation-time,
    environment-scenes,
    site,
    timezone,
    schema-migration,
    commands,
    undo,
    session-state,
  ]
related:
  [
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0130-finishes-system-architecture,
    decisions/ADR-0029-schema-registry-migration-framework,
  ]
sourceFiles:
  [
    docs/specs/2026-07-01-realistic-environmental-lighting.md,
    core/environment/observation-time.ts,
    core/model/environment-scene.ts,
    core/model/types.ts,
    core/model/site.ts,
    core/model/factories.ts,
    core/migrations/schema/add-site-timezone.ts,
    core/migrations/schema/add-environment-scenes.ts,
    core/commands/handlers/environment-scene-commands.ts,
    core/commands/handlers/site-commands.ts,
    bridge/session/editor-session.ts,
  ]
status: current
updated: 2026-07-02
---

# ADR-0143: Environment model foundations

## Status

Accepted, landed. Slice 0 of the realistic-environmental-lighting epic adds the persisted and
session-state model that later slices will drive lighting from. Nothing drives lighting yet.
This ADR records the data-model decisions that slice made, so later slices inherit a settled
shape.

## Context

The epic (`docs/specs/2026-07-01-realistic-environmental-lighting.md`) renders a building under
real daylight for a place, a date, and a time of day. That needs a stored model of where the
building sits and of the moments it is viewed at, plus a way to save and reload named viewing
conditions. Slice 0 lands that model and wires none of it to the renderer. The decisions below
are about how the model is shaped and how it changes, not about lighting math.

## Decision

### Observation time: separate the "when" from the "where"

A pure-core type, `ObservationInstant` in `core/environment/observation-time.ts`, is the
working form:

```ts
interface ObservationInstant {
  readonly date: string // YYYY-MM-DD
  readonly minutesSinceMidnight: number
}
```

It is held in per-view session state. An `EnvironmentScene` stores its moment as `observedAt`,
an ISO 8601 civil datetime string (`YYYY-MM-DDThh:mm`), which diffs cleanly in JSON. Timezone
does not sit on `ObservationInstant`. It sits on `Site`.

The split is deliberate. `Site` carries the "where" (its latitude and longitude, and its
timezone). An observation instant carries the "when" (a wall-clock date and time). Slice 1a
places the sun by combining `Site.latLong`, `Site.timezone`, and an `ObservationInstant`.
Keeping timezone on the site means a scene's wall-clock time reads the same no matter where the
project sits, and moving the project does not have to rewrite every scene. This reverses an
earlier investigation note that had folded timezone into `ObservationInstant`; that would have
copied the site's timezone onto every scene and let the two drift apart.

### Environment scenes are an optional project field

`Project` gains `environmentScenes?: EnvironmentScene[]`, optional rather than a required array.

A required array was the first choice, to mirror how `stairs` is modeled. It would have broken
about thirty hand-built `Project` literals across the test suite, because each one would have
had to add the new field. Optional also matches the other optional collections on `Project`
(`site`, palettes, paint). So the field is optional.

To keep it present in practice, `createEmptyProject` initializes it to `[]`, and the version-15
migration backfills it. Every real version-15-and-later project therefore has the array. The
remove command keeps it as `[]` and never collapses it back to `undefined`, so once a project
has scenes the field does not flip type underneath a reader. This reverses the plan's initial
"required, mirror stairs" choice; the required-field blast radius across the fixtures forced it.

### Two schema versions, one migration each

The model lands as two sequential schema versions rather than one combined step:

- Version 14 adds the optional `Site.timezone`. Its migration is a passthrough, because an
  older document that omits the field is already valid at version 14.
- Version 15 adds `environmentScenes`. Its migration backfills the array, mirroring the stairs
  backfill migration.

The generated schema JSON was regenerated and committed for both. Splitting into two versions
keeps each migration to a single field, which is easier to reason about and to reverse than one
migration that touches both.

### Environment scenes mutate through dispatch and undo

Add, remove, and rename go through command handlers. Each handler reassigns the whole
`state.environmentScenes` array rather than editing it in place. Undo needs that: the
inverse-capture proxy records only the project root's own top-level keys, so a whole-array
reassignment is what it can capture and replay. An in-place element edit would go unseen.

Registering these handlers turned up a latent gap. `registerSiteCommands` was defined and
unit-tested but never wired into the live command registry, so site commands threw at runtime.
Slice 0 wires both `registerSiteCommands` and `registerEnvironmentSceneCommands` into the
editor-session registry, which closes that gap (a prerequisite for issue #407).

## Consequences

- The project document format is now at schema version 15.
- Later slices inherit a settled shape for observation time and environment scenes and do not
  have to revisit it. The `EnvironmentState` contract, and the finishes and material-provider
  seams those slices build on, are recorded in [[ADR-0067-three-dimensional-painted-preview]]
  and [[ADR-0130-finishes-system-architecture]].
- Site commands work at runtime now. They were dead before this slice registered them.
- This ADR is the durable record of two calls that deviate from earlier notes: timezone lives
  on `Site` and not on the observation instant, and `environmentScenes` is optional and not
  required.

## References

- Realistic-environmental-lighting spec, slice 0
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- [[ADR-0029-schema-registry-migration-framework]] (the migration framework the version-14 and
  version-15 migrations plug into).
- [[ADR-0067-three-dimensional-painted-preview]] and
  [[ADR-0130-finishes-system-architecture]] (the material seams and finishes system that later
  slices drive from this model).
