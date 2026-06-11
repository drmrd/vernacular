---
slug: decisions/ADR-0047-published-floor-plan-data-format-standard
title: 'ADR-0047: Published floor-plan data format standard (Vernacular Floor Plan Format)'
type: decision
tags:
  [
    architecture,
    data-format,
    schema,
    json-schema,
    versioning,
    migrations,
    extensibility,
    third-party-extensions,
    reserved-namespaces,
    content-addressed-assets,
    registries,
    test-fixtures,
    interoperability,
    conformance,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0046-period-style-and-room-purpose-registries,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
  ]
status: accepted
updated: 2026-06-10
---

# ADR-0047: Published floor-plan data format standard (Vernacular Floor Plan Format)

## Status

Accepted. The companion specification `docs/specs/2026-06-10-vernacular-floor-plan-format.md`
is the normative artifact this ADR introduces. The first implementation plan has landed: the
CORE JSON Schema is generated from the `core/model` types and committed under
`schema/<version>/`, a `core/` Ajv validator checks Documents against it, a drift guard keeps
the committed schema in lockstep with the types, and the project fixtures validate as
conformant Documents. The file rename (`project.json` to `vernacular.json` and `.house.zip` to
`.building`) landed next, and the forward-compatibility preservation round-trip,
validate-after-migration on load, and the optional Strict profile followed in ADR-0050. This ADR
justifies a design-specification
addendum (it formalizes sections 3.3, 3.4, and 4) per the project rule that any change to the
specification carries a corresponding ADR.

## Context

The project's on-disk shape was already designed but only informally: the design specification
describes a project Folder and a shareable archive (section 3.3), a versioning and migration
scheme (section 3.4), and an asset, registry, and pack extension system (section 4). The shape
lived as TypeScript interfaces in `core/model/` with no machine-readable schema, no published
conformance contract, and no documented seam for third-party data on the entity tree itself.

Two pressures made formalizing it worthwhile now. First, building a corpus of floor-plan test
fixtures needs a precise, enforced contract for what a valid project Document is. Second,
ADR-0044 already commits to publishing the project schema formally, with historic extensions
namespaced, so the format can anchor an open reference over time. The native model stays the
source of truth in that decision; the heavyweight building-information-modeling interoperability
seam (the Industry Foundation Classes and its JSON serialization) stays an exporter and importer
concern, not the native format.

The question was how ambitious the standard should be, how the machine-readable schema should
relate to the TypeScript types, and how much surface to commit to in the first version.

## Decision

Publish the native format as a versioned standard, the Vernacular Floor Plan Format, defined
normatively in the companion specification. The decisions that shape it:

1. **Publish the native format, do not invent a new one.** The standard is the existing project
   model and project file shape, documented and validated. Naming is settled: the canonical
   Document is `vernacular.json`, and the shareable archive is a `*.building` ZIP. These rename
   the current `project.json` and `.house.zip`. Because the project is pre-1.0 (a 0.x series),
   this is a clean break with no compatibility shim: the old names are deprecated and the change
   is recorded in the release notes.

2. **Generate the JSON Schema from the TypeScript types.** `core/model/` stays the single source
   of truth. A build step generates `schema/<version>/vernacular.schema.json`, committed as the
   published artifact, and continuous integration fails on drift. A validator in `core/` (Ajv)
   validates Documents; it gates fixtures and continuous integration and may run on app load
   after migration as a safety gate, not a user-facing hard rejection.

3. **Schematize a small, honest CORE plus a reserved-namespace map.** The CORE schema covers
   only the entities Vernacular implements today (meta, floors, walls, openings, derived rooms
   with overrides, dimensions, underlays, period and style, asset references). The specification
   additionally reserves, by name, the first-party entities the entity tree anticipates and the
   modeling concepts the floor-plan corpus surfaced as gaps (curved walls, multi-building
   properties, covered outdoor rooms, courtyard holes, accessibility clearances, roof and sloped
   ceilings, split levels, and others). Reserved names become CORE additively in a later
   `schemaVersion`.

4. **Three layered extension seams.** Registry-typed elements (data-driven packs) cover most
   near-term growth; reserved first-party namespaces keep future entities additive; and a
   reverse-DNS-namespaced `extensions` object on any entity carries third-party data without
   breaking CORE validation. A preservation rule requires processors to round-trip unknown
   extension and reserved data without dropping it.

## Consequences

- The format gains a published, machine-validated contract, and the test-fixture corpus gains an
  enforced definition of a valid Document (the minimal valid Document is `meta` plus one floor,
  which is the smallest underlay fixture the corpus needs).
- The TypeScript types stay canonical, so the change is additive: no domain model rewrite, and a
  drift guard keeps the schema honest. New dependencies (a schema generator and a validator)
  honor the dependency cooldown and exact-version pins, and live in `core/` and `scripts/` only.
- The rename from `project.json` and `.house.zip` to `vernacular.json` and `*.building` touches
  the storage layer (project stores and bundle export). Because the project is pre-1.0 it is a
  clean rename with no compatibility shim, deprecated in the release notes and sequenced in the
  implementation plan, not here.
- Future capabilities land in named, reserved slots rather than as ad hoc fields, so the
  extensibility seams of [[ADR-0034-future-direction-extensibility-seams]] and the registry
  pattern of [[ADR-0006-registry-pattern]] now have an explicit home in the published format.
- The design specification sections 3.3, 3.4, and 4 are formalized and extended by the companion
  specification; this ADR is their addendum of record.
