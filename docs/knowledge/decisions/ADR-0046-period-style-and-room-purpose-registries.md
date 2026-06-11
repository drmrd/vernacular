---
slug: decisions/ADR-0046-period-style-and-room-purpose-registries
title: 'ADR-0046: Split the single era concept into independent Period and Style registries, with a Room-Purpose registry and a per-element tagging and resolution model'
type: decision
tags:
  [
    architecture,
    core,
    registries,
    period,
    style,
    room-purpose,
    vernacular,
    old-house-vocabulary,
    tagging,
    resolution,
    overrides,
    commands,
    undo-redo,
    schema-migration,
    spec-divergence,
  ]
related:
  [
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-09-era-and-room-purpose-registries.md,
    core/registries/periods.ts,
    core/registries/styles.ts,
    core/registries/room-purposes.ts,
    core/architecture-era/resolve-period.ts,
    core/architecture-era/resolve-style.ts,
    core/model/types.ts,
    core/model/factories.ts,
    core/migrations/schema/add-period-and-style.ts,
    core/commands/handlers/project-commands.ts,
    core/commands/handlers/room-commands.ts,
  ]
status: current
updated: 2026-06-09
---

# ADR-0046: Period, Style, and Room-Purpose registries

## Status

Accepted. The first slice of the old-house vocabulary track
(`feat/era-and-room-purpose-registries`) implements three new registries and a
pure-`core/` tagging and resolution data model. The product owner approved the
divergence from the design specification's single-`EraRegistry` wording recorded
below.

## Context

The design specification (sections 3.2 and 4.4) describes a single `EraRegistry`
and a single `era` field resolving `room.eraOverride ?? floor.eraOverride ??
project.era`. ADR-0006 listed `EraRegistry` and `RoomPurposeRegistry` among the
seven planned registries without seeding them.

A single "era" axis conflates two things that are independent for an old house:
the chronological period a house was built in and its architectural style. A
Foursquare can be Edwardian-period; a Colonial Revival can be Interwar. Modeling
them as one field forces a user to pick one meaning and loses the other. The
old-house audience needs both, and needs to express vernacular (folk) forms of
academic high styles. This slice ships the identity-bearing data front of the
track as pure-`core/` data and undoable commands.

## Decision

### Split the single era concept into two independent registries

Realize the spec's one `EraRegistry`/`era` as two complementary registries, each
resolving through the identical override hierarchy:

- **Period registry** (`core/registries/periods.ts`): the chronological era
  (`colonial`, `early-republic`, `antebellum`, `victorian`, `edwardian`,
  `interwar`, `postwar`, `contemporary`, plus an explicit `unknown` for houses of
  uncertain date). Each entry carries a locale-aware `displayName` and a
  human-readable `approximateRange` (for example `'c. 1837-1901'`, hyphen not
  em-dash).
- **Style registry** (`core/registries/styles.ts`): the architectural style.

This extends, rather than replaces, ADR-0006's registry plan: the `EraRegistry`
slot becomes the Period registry, and the Style registry is a new sibling. Both
follow the existing `createRegistry` shape and seed `en-US` display names only.

### Vernacular variants: category on the entry, modifier on the tag

Each `Style` entry declares `category: 'academic' | 'vernacular'`. Two cases:

- **Named folk forms** are first-class seeded entries with
  `category: 'vernacular'`: `folk-victorian`, `hall-and-parlor`, `i-house`,
  `gabled-ell`, `shotgun`, `saltbox`.
- **Academic styles with a recognized vernacular form that is not its own named
  style** declare `hasVernacularVariant: true` (for example Gothic Revival, whose
  vernacular is Carpenter Gothic).

A per-element `StyleTag { styleId: StyleId; vernacular?: boolean }` carries the
optional modifier. The `vernacular` boolean is meaningful only when the
referenced entry has `hasVernacularVariant: true`; on a `category: 'vernacular'`
entry or an academic entry without the flag it is ignored (a later UI cycle hides
the toggle there). This keeps the registry authoritative, keeps the per-element
tag a single boolean, and avoids inventing a synthetic registry id for every
academic-plus-vernacular pair.

### Room-Purpose registry plus optional free-text sub-purpose

A `RoomPurposeRegistry` (`core/registries/room-purposes.ts`) seeds modern
purposes plus historic reception, service, and private/transitional purposes
(`parlor`, `scullery`, `butlers-pantry`, and others) plus an explicit `other`
catch-all. A room carries a `purpose` registry id and an OPTIONAL free-text
`subPurpose` string (never required). A user can write a finer label such as
"Silver Pantry" as a sub-purpose without a registry entry, and a room can carry a
purpose with no sub-purpose at all.

### Symmetric resolution hierarchy in data

Period and style each resolve through the SAME hierarchy `room ?? floor ??
project` via pure helpers in `core/architecture-era/` (`resolvePeriod`,
`resolveStyle`). The effective value is never stored; it is computed from the
explicit value at each level. Period has a required project default, so
`resolvePeriod` always returns a `PeriodId`. Style has no required default, so
`resolveStyle` may return `undefined`. The directory name avoids the bare word
"era" now that the concept is two axes.

### Model rename and additive fields, carried by schema migration v4 to v5

- `ProjectMeta.era` is renamed to `meta.period` (and the `EraId` alias to
  `PeriodId`), reading truthfully now that style is separate.
- `meta.style?: StyleTag` is added as the optional project-level style default.
- `Floor` gains optional `periodOverride?` and `styleOverride?`.
- `RoomOverride` gains optional `purpose?`, `subPurpose?`, `periodOverride?`, and
  `styleOverride?` (extending the existing top-level `roomOverrides` map from
  ADR-0036 rather than introducing a new structure).

The rename and the new floor and project fields change the persisted shape, so
they ride a single schema migration, `add-period-and-style`
(`core/migrations/schema/add-period-and-style.ts`), advancing
`CURRENT_SCHEMA_VERSION` from 4 to 5. The migration moves `meta.era` to
`meta.period` when the legacy key is present and otherwise passes through; the new
optional fields need no defaulting because absent is treated identically to
present-but-undefined. The per-room fields ride inside the already-optional
`roomOverrides` map, so they need no migration of their own.

Every mutation is an undoable command through the existing dispatch boundary:
`setProjectPeriod`, `setProjectStyle`, `setFloorPeriod`, `setFloorStyle`,
`setRoomPurpose`, `setRoomSubPurpose`, `setRoomPeriod`, `setRoomStyle`. Setting a
value to `undefined` clears it and falls back to the next level; undo restores the
prior value, including back to absent.

## Spec reconciliation

This DIVERGES from the design specification's single-`EraRegistry` wording in
sections 3.2 and 4.4, which describe one `era` field and one `EraRegistry`. The
product owner approved splitting that concept into Period and Style and adding
vernacular variants. Per the project rules, a change to the design specification
rides with an ADR, and this ADR is the authoritative record of the divergence.
The specification text itself is NOT edited inside this data slice; updating the
spec prose (sections 3.2 and 4.4) is a follow-on that lands with this ADR in hand.
Until then, treat this ADR as the source of truth where it disagrees with the
spec on era, period, and style.

## Consequences

- Chronological period and architectural style are now independent, queryable
  axes. Library biasing by period and by style (an assets-track convergence node
  per ADR-0044) can read both without disambiguating an overloaded field.
- The vernacular modifier is a single boolean on the tag, with the registry as
  the authority on which styles support it. Adding a new folk form is a registry
  entry; adding a new academic-plus-vernacular pair is a flag, not a new id.
- The resolution helpers are symmetric and pure, mirroring the existing override
  patterns; downstream UI reads effective values without storing them.
- Projects saved before this slice migrate forward automatically: `meta.era`
  becomes `meta.period` at schema version 5.
- The `era` to `period` and `EraId` to `PeriodId` renames touch `core/` widely
  (notably `createEmptyProject` call sites across the test suite) and are a
  merge-coordination point with the parallel assets track that also reads
  `core/model/types.ts` and `core/index.ts` (see ADR-0044 and the plan's
  merge-coordination summary).
- The design specification prose is temporarily out of sync until the follow-on
  spec update lands; this ADR records the intended state.

## References

- Design specification, sections 3.2 and 4.4 (the single era concept this slice
  splits) and section 7.2 (locale-aware display names).
- Implementation plan: `docs/plans/2026-06-09-era-and-room-purpose-registries.md`.
- ADR-0006 (the registry pattern this extends).
- ADR-0036 (the room-overrides slice these per-room fields ride in).
- ADR-0029 (the schema-migration framework the v4 to v5 step uses).
- ADR-0044 (the delivery-track sequencing and the assets-track convergence for
  period-aware and style-aware library biasing).
