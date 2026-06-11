---
slug: decisions/ADR-0052-corpus-conformant-fixture-tiers
title: 'ADR-0052: Representability tiers and the corpus-as-conformant-fixtures contract'
type: decision
tags:
  [
    architecture,
    data-format,
    conformance,
    fixtures,
    corpus,
    representability,
    underlay,
    extensions,
    preservation,
    json-schema,
    validation,
    content-addressed-assets,
  ]
related:
  [
    decisions/ADR-0047-published-floor-plan-data-format-standard,
    decisions/ADR-0051-format-preservation-and-load-validation,
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-vernacular-floor-plan-format.md,
    docs/plans/2026-06-11-corpus-conformant-fixtures.md,
    resources/floor-plans/CONVENTIONS.md,
  ]
status: current
updated: 2026-06-11
---

# ADR-0052: Representability tiers and the corpus-as-conformant-fixtures contract

## Status

current

## Context

Section 9 of the Vernacular Floor Plan Format specification asks the project's curated
floor-plan corpus to become an enforced, provenance-linked definition of "a valid floor
plan": every fixture should be a `vernacular.json` Document that continuous integration
validates against the published format.

The corpus is a set of real, openly-licensed plans (`resources/floor-plans/`), and they
differ in how much of each plan the published CORE schema can express today. A tiny
right-angled cottage is fully traceable; a geodesic dome or a curved-curtain-wall castle is
not. A flat "trace everything" rule would either force unfaithful traces of un-modeled
geometry or exclude the hardest, most valuable plans. The corpus metadata already records,
per plan, which capabilities ship today (`supported_examples`), which are on the roadmap
(`roadmap_examples`), and which are genuine gaps (`gap_features`). That taxonomy is the
signal for how each plan can be turned into a conformant fixture.

Two prior decisions make a tiered approach workable without changing the model or the
schema: every CORE entity is `additionalProperties: false` but carries an open `extensions`
map keyed by reverse-DNS namespaces (ADR-0047), and reserved/namespaced data round-trips
through load and save unchanged (ADR-0051). Underlay rasters are content-addressed assets
(ADR-0007).

## Decision

Adopt a **representability tier** classification, recorded as `representabilityTier` on each
corpus `meta.json` and documented in `resources/floor-plans/CONVENTIONS.md`, and make the
fixture corpus an enforced conformance gate:

- **Tier 0 (underlay).** Expressible only as a calibrated background to trace over. The
  fixture is `meta` plus one `Floor` plus one `Underlay` that references the raster as a
  content-addressed `AssetReference` (`scope: project`). It is derived from per-plan
  calibration (`image_width_px`, `image_height_px`, a `millimetersPerPixel`/`offset`/
  `rotation` anchor) by the pure `deriveUnderlayFixture` function; a generation entry point
  (`pnpm fixtures:generate`) hashes the raster bytes (hex SHA-256, the same content hash the
  editor's underlay loader uses) and writes the fixture.
- **Tier 1 (core).** Walls, openings, dimensions, and rooms are expressible in CORE. The
  fixture is a hand-traced CORE Document, faithful to the plan's labelled dimensions in
  millimeters.
- **Tier 2 (reserved).** The plan needs one or more gap features. The fixture is a Tier-1
  CORE trace of the expressible part plus the un-modeled aspect carried in a reverse-DNS
  `extensions` namespace (for example `org.vernacular.covered-outdoor` for porches, carports,
  and terraces), which stays CORE-conformant because `extensions` is an open object. Tier 2
  doubles as the corpus of preservation round-trip fixtures: a real fixture is loaded and
  saved through `FolderProjectStore` and its reserved data is asserted to survive unchanged,
  exercising ADR-0051 end to end.

A single conformance gate (`tests/format/corpus-conformance.test.ts`) discovers every
`tests/fixtures/projects/corpus/*.vernacular.json` and validates each against the Core
profile (`createDocumentValidator`) and the Strict profile (`createStrictValidator` with a
registry of reserved first-party namespace schemas). A Tier-0 plan can additionally be packed
into a shareable `.building` archive carrying its underlay as a content-addressed asset under
`assets/<contentHash>` and a generated `ATTRIBUTIONS.md`, validated by an archive-level
conformance test.

This is fixtures, a pure derivation/packing layer, and tests only: no `core/model` change and
no schema change.

## Consequences

- The corpus becomes a living, tiered definition of "a valid floor plan" that CI enforces,
  with a clear provenance chain from each fixture back to its source raster and license.
- Classifying a plan with a `representabilityTier` is a commitment to ship its fixture; the
  tier model keeps the hardest plans in the corpus (as Tier-0 underlays) instead of dropping
  them.
- Tier-2 fixtures give ADR-0051 real-fixture regression coverage rather than only synthetic
  unit tests.
- Calibration is per-plan analysis work and is intentionally iterative: a first batch is
  calibrated and the `calibration.basis` field records when a value is still provisional.
- Pure fixture tooling lives in `scripts/fixtures/` as plain-ESM `.mjs` with sibling `.d.mts`
  declarations (matching the schema builder), so it has no runtime dependency on TypeScript
  source; small constants shared with `core/` (the default ceiling height, the asset
  directory prefix) are duplicated with a documented rationale rather than imported.

## References

- docs/specs/2026-06-10-vernacular-floor-plan-format.md, section 9
- docs/plans/2026-06-11-corpus-conformant-fixtures.md
- resources/floor-plans/CONVENTIONS.md
- ADR-0047 (published floor plan data format standard)
- ADR-0051 (forward-compatibility preservation and load-time validation)
- ADR-0007 (content-addressed asset references)
