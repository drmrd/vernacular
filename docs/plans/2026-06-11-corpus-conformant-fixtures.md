# Corpus-Derived Conformant Fixtures Implementation Plan

> **For agentic workers:** this plan has a prerequisite decision (below) that gates its first
> executable slice. Resolve it before starting the red-green-blue cycles. Execution then uses the
> project's role-separated cycle (test-author, implementer, clean-code-reviewer, refactorer) and
> keeps `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` green and
> `pnpm rgb:audit origin/main..HEAD` clean.

**Goal:** Turn the floor-plan corpus into a tiered set of conformant `vernacular.json` Documents that
every continuous-integration run validates against the published format (spec section 9), so the
fixture corpus becomes an enforced, provenance-linked definition of "a valid floor plan."

**Architecture:** A representability-tier model over the existing floor-plan corpus, a metadata-driven
derivation step that emits Tier-0 Documents from per-plan metadata, hand-traced Tier-1 Documents for
plans expressible in the CORE schema, and a conformance gate that validates the whole fixture corpus
against the Core profile (and, where namespaced data is present, the Strict profile from ADR-0051).
No `core/model` or schema change; this is fixtures, a derivation script, and tests.

**Tech Stack:** TypeScript, Vitest, the published CORE schema and `createDocumentValidator` /
`createStrictValidator` (ADR-0047, ADR-0051), the content-addressed asset model (ADR-0007), and the
`.building` archive codec (`storage/zip`).

---

## Prerequisite decision (resolve before executing)

This plan derives fixtures from the floor-plan corpus, which is **not on `main`**. It lives on the
local branch `docs/floor-plan-corpus` at `resources/floor-plans/` (34 plans; each a folder with a
downscaled raster, `meta.json`, and `description.md`; an `ATTRIBUTION.md` and `CONVENTIONS.md`; all
files public domain, U.S. Government works, Public Domain Mark, CC0, CC BY, or CC BY-SA). Two
sub-questions must be answered first; both are the maintainer's call, not a best-practice default:

1. **Does the corpus land on `main`?** Tier-0 and the `.building` fixtures reference the actual
   rasters as content-addressed assets, so the corpus (downscaled rasters included, longest side at
   most 2200 px per its conventions) needs to be on `main` for fixtures to resolve their assets and
   for continuous integration to validate them. Options:
   - **(A, recommended) Land the corpus on `main` first**, as its own reviewed change (no code, just
     curated open-licensed resources plus the generated `README.md`/`ATTRIBUTION.md`), then build
     this plan on top. Keeps provenance and licensing in one reviewable place.
   - **(B) Keep the corpus off `main`** and ship only synthetic Documents authored to mirror corpus
     plans (no rasters, no `.building` archives). This loses the "shared provenance chain with the
     source images" that section 9 calls for, but unblocks fixture conformance without committing
     binary assets.
2. **Who enriches calibration?** A Tier-0 underlay fixture needs the raster's pixel dimensions and a
   calibration anchor (world millimeters per pixel), which `meta.json` does not record today. Plans
   carry labelled room dimensions (for example the 24 ft by 24 ft cottage, plan 01), so calibration
   is recoverable, but it is per-plan analysis work. This plan adds the metadata fields and a
   first batch; completing all 34 is iterative.

The slices below assume path **(A)**. Under path (B), drop Tier-0/`.building` (Slices 2 and 5) and
keep the tier model, the synthetic Tier-1 Documents, and the conformance gate.

---

## Background

- Section 9 requires every fixture to be a `vernacular.json` Document that validates against the Core
  profile in continuous integration. The minimal valid Document is `meta` plus one `Floor`,
  optionally with a single calibrated `Underlay`; richer fixtures add walls, openings, dimensions,
  and room overrides across one or more floors.
- Plan 1 shipped two fixtures (`tests/fixtures/projects/{minimal,two-floor-cottage}.vernacular.json`)
  and `tests/format/schema-conformance.test.ts`, which already validates them and checks extension
  acceptance and unknown-key rejection. This plan generalizes that into a corpus-wide, tiered gate.
- Each corpus `meta.json` records `supported_examples` (capabilities the plan exercises that ship
  today), `roadmap_examples`, and `gap_features` (`{ slug, why }` for capabilities neither shipped
  nor on the roadmap). That taxonomy is the representability signal this plan formalizes as tiers.
- ADR-0051 guarantees that reserved keys and `extensions` round-trip through load and save, so a
  Tier-2 plan can carry its un-modeled aspects (a curved wall, a covered outdoor room) as reserved or
  namespaced data on an otherwise CORE-conformant Document without breaking Core validation.

## Representability tiers

A new `docs/knowledge/glossary` term and a `representabilityTier` field on the corpus `meta.json`
classify each plan:

- **Tier 0 (underlay):** expressible only as a calibrated background to trace over. The fixture is
  `meta` + one `Floor` + one `Underlay` referencing the raster. Always derivable for any plan with
  calibration.
- **Tier 1 (core):** the plan's walls, openings, dimensions, and rooms are expressible in the CORE
  schema today (its `gap_features` is empty or cosmetic). The fixture is a hand-traced CORE Document.
- **Tier 2 (reserved):** the plan needs one or more reserved or gap features (curved walls, covered
  outdoor rooms, split levels, and so on). The fixture is a Tier-1 CORE trace of the expressible part
  plus the un-modeled aspect carried in a reserved key or an `extensions` namespace, which the
  preservation rule keeps intact. Tier 2 doubles as the corpus of preservation-round-trip fixtures.

Plan 01 (tiny square cottage, `gap_features: covered-outdoor-rooms`) is the canonical Tier-2 starter:
its three rectangular rooms trace cleanly as CORE; its two open porches ride as reserved
`room.coveredOutdoor` data.

## File structure

- `tests/fixtures/projects/corpus/<NN-slug>.vernacular.json` - generated and hand-authored fixtures.
- `tests/fixtures/projects/corpus/<NN-slug>.building` - archives for fixtures that ship the raster.
- `scripts/fixtures/derive-underlay-fixture.mjs` - Tier-0 derivation from corpus `meta.json` plus
  calibration; pure, unit-tested, mirrors the `scripts/schema` generator style.
- `tests/format/corpus-conformance.test.ts` - the corpus-wide Core-profile (and Strict, where
  applicable) gate.
- `resources/floor-plans/*/meta.json` - add `representabilityTier`, `image_width_px`,
  `image_height_px`, and a `calibration` anchor (only on the plans this plan enriches).
- `docs/knowledge/decisions/ADR-00NN-corpus-conformant-fixture-tiers.md` - the tier-model decision.

## Slices (path A)

Each behavior is one red-green-blue cycle unless marked infrastructure.

### Slice 1: representability-tier model and the conformance gate (no corpus rasters needed)

1. Add a `representabilityTier` field (`0 | 1 | 2`) to the corpus `meta.json` schema documentation in
   `CONVENTIONS.md` and to the first few plans' `meta.json`. (docs/infrastructure.)
2. RGB: `tests/format/corpus-conformance.test.ts` discovers every
   `tests/fixtures/projects/corpus/*.vernacular.json`, validates each against the Core profile
   (`createDocumentValidator`), and fails if any does not conform. Seed it with one hand-authored
   Tier-1 fixture (plan 15, G. B. Cooley House, `gap_features: none`) traced to CORE.
3. RGB: the gate additionally runs the Strict profile (`createStrictValidator`) over any fixture that
   carries `extensions`, with an empty registry (so unregistered namespaces pass) and one registered
   namespace schema exercised by a Tier-2 fixture.

### Slice 2: Tier-0 underlay derivation (needs corpus on main)

4. RGB: `scripts/fixtures/derive-underlay-fixture.mjs` exports `deriveUnderlayFixture(meta,
calibration)` returning a Tier-0 Document (`meta` + one `Floor` + one `Underlay`) whose `Underlay`
   references the raster as an `AssetReference` (`scope: "project"`, content hash of the raster
   bytes) with `placement` from the calibration anchor. Unit-test the pure function.
5. Infrastructure: a generation entry point writes the derived Tier-0 fixtures and the conformance
   gate validates them.

### Slice 3: Tier-1 traced fixtures

6. RGB per plan (batchable): hand-trace a small starter set of CORE-expressible plans (for example
   plans 15, 18, 21) into Tier-1 Documents and add each to the gate. Tracing is judgement work; keep
   each fixture small and faithful to labelled dimensions, in millimeters (the format's unit).

### Slice 4: Tier-2 reserved-data fixtures (depends on Plan 3 preservation)

7. RGB: author plan 01 as a Tier-2 Document (CORE rooms plus `room.coveredOutdoor` reserved data for
   the porches) and add a preservation-round-trip test: load through `FolderProjectStore`, save, and
   assert the reserved data survives byte-for-value (exercising ADR-0051's overlay end to end on a
   real fixture).

### Slice 5: `.building` archives carrying rasters (needs corpus on main)

8. Infrastructure: for the Tier-0 fixtures that need the actual raster, pack a `.building` archive
   (`storage/zip`) carrying the underlay as a content-addressed asset and a generated
   `ATTRIBUTIONS.md` from the plan's license metadata, and add an archive-level conformance check.

## Knowledge and finalization

- Add an ADR for the tier model and the corpus-as-fixtures contract; refresh the section-9 references.
- Run `pnpm knowledge:index` locally.
- PR-level review; confirm the rgb audit is clean and the full chain plus the new conformance gate are
  green.

## Self-review (spec coverage)

- Section 9 "every fixture validates against the Core profile in CI": Slice 1 gate.
- Section 9 "minimal valid Document is meta plus one Floor, optionally one Underlay": Tier 0, Slice 2.
- Section 9 "richer fixtures add walls, openings, dimensions, room overrides across floors": Tier 1,
  Slice 3.
- Section 9 ".building archive carrying the underlay as a content-addressed asset, license data into
  ATTRIBUTIONS.md": Slice 5.
- Sections 6.2/6.4 reserved-name preservation as a corpus: Tier 2, Slice 4 (built on ADR-0051).
