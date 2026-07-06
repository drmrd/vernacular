---
name: vernacular-research-frontier
description: 'Use when asking where Vernacular can advance the state of the art, scoping or prioritizing a research direction, drafting novelty or differentiation claims, or choosing the next frontier slice. Triggers: research frontier, novelty, state of the art, period-accurate construction, construction profiles, browser daylighting, color-accuracy gate, open interchange, VFPF, ifcJSON, IFC, derived geometry, DCEL, curved walls, what makes this project different.'
---

# Vernacular research frontier

## Overview

Vernacular can plausibly advance the state of the art in four areas. Three are owner-confirmed directions; the fourth is a candidate that must earn its status. Every frontier claim in this file is anchored to a shipped, test-covered repo asset, and nothing is claimed beyond what tests prove. Hold that line: a stated gate is not a passed gate, and a candidate is not a result.

## When to use

- Deciding which research direction to invest in next, or how far along one really is.
- Writing anything that claims novelty or differentiation for the project.
- Answering "what is actually special here" for a new contributor or an external audience.
- Finding the concrete repo entry point (file, registry, seam, issue) for a frontier idea.

## When NOT to use

- Turning a specific hunch into an accepted result (evidence bar, idea lifecycle, adversarial checks): use vernacular-research-methodology.
- House wording rules for external text (no third-party product names, humanizer pass, tone): use vernacular-docs-and-writing.
- What counts as test evidence and how baselines work: use vernacular-validation-and-qa.
- Fixing a 3D rendering defect rather than researching one: use vernacular-rendering-defect-campaign.
- The load-bearing design decisions themselves: use vernacular-architecture-contract.

## Quick reference

Statuses as of 2026-07-05.

| #   | Frontier                                | Status          | Core repo asset                                                                                     | Anchor records                                                                              | Next gate                                             |
| --- | --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Period-accurate construction modeling   | Owner-confirmed | Period/style/purpose/construction registries plus derived wall topology                             | ADR-0046, ADR-0137, ADR-0026                                                                | Issues #414, #380                                     |
| 2   | Physically credible browser daylighting | Owner-confirmed | Color-managed solar, sky, probe, and ambient-occlusion pipeline plus a written accuracy bar         | ADR-0142 through ADR-0151; spec `docs/specs/2026-07-01-realistic-environmental-lighting.md` | Issues #444, then #449, then #450                     |
| 3   | Open plan interchange                   | Owner-confirmed | Published Vernacular Floor Plan Format: spec, generated schema, migration ladder, preservation rule | ADR-0047, ADR-0051, ADR-0052, ADR-0007                                                      | Resolvable schema `$id`; an independent reader        |
| 4   | Derived-geometry editing                | Candidate only  | Derived rooms, the DCEL evaluation, the snap architecture                                           | ADR-0026, ADR-0097, ADR-0033                                                                | DCEL spike, gated on issue #80 or #78 being scheduled |

All ADRs live under `docs/knowledge/decisions/`. DCEL means doubly-connected edge list, a half-edge data structure for planar subdivisions.

## Frontier 1: period-accurate construction modeling

### Why mainstream floor planners fall short

Mainstream floor planners model a wall as a generic box with one hand-entered thickness and modern-material defaults. Historic fabric is layered: solid brick with a plaster face, studs under wood lath and plaster. The finished thickness and the renovation behavior come from the assembly, not from a number. Era is at best a cosmetic label, style is not modeled at all, and room vocabulary is modern only (no parlor, no scullery).

### Vernacular's asset

A domain model built for historic fabric, shipped and unit-tested in pure `core/`:

- **Two independent era axes.** ADR-0046 split the single era concept into a Period registry (`core/registries/periods.ts`, 9 entries: `colonial` through `contemporary` plus an explicit `unknown`, each dated entry with an approximate range) and a Style registry (`core/registries/styles.ts`, 32 entries, 6 of them named vernacular folk forms such as `i-house` and `shotgun`, plus a `hasVernacularVariant` modifier for academic styles). Both resolve room, then floor, then project via `core/architecture-era/resolve-period.ts` and `resolve-style.ts`; the effective value is never stored. Where the design spec still says "one EraRegistry", ADR-0046 is authoritative.
- **Historic room purposes.** `core/registries/room-purposes.ts` seeds reception, service, and private purposes (`parlor`, `scullery`, `butlers-pantry`) plus a free-text `subPurpose`.
- **Wall construction profiles.** ADR-0137: a wall may name a layered assembly, and the assembly's layer-sum drives its drawn footprint. Registry: `core/registries/construction-profiles.ts` (4 seeded profiles: `platform-framed-drywall`, `balloon-framed-lath-and-plaster`, `solid-masonry-brick`, `solid-masonry-stone`). Pure resolver: `effectiveWallThickness` in `core/scene/construction-profile.ts`. Unknown or absent profile falls back to the raw `thickness` field, so old projects never regress.
- **Derived topology.** Rooms are computed from wall topology, never stored (ADR-0026, `core/topology/rooms.ts`); the published format makes that a normative invariant.

Honest limits as of 2026-07-05: only the 3D wall builder (`engine/scene/wall-builder.ts`) reads `effectiveWallThickness`; the 2D plan symbol still draws the raw `wall.thickness` (`editor/plan/draw-plan.ts` line 394, issue #414 open). Walls render as one solid block; per-layer materials are deferred to issue #380. Four profiles is a starter set, not a catalog.

### First three steps in this repo

1. Close #414: size the 2D wall symbol from `effectiveWallThickness` so both renderers share one thickness source. Files: `editor/plan/draw-plan.ts`, helper exported from `core/` via `core/index.ts`.
2. Grow `core/registries/construction-profiles.ts` into an era-indexed catalog. New assemblies are registry entries, not model changes (ADR-0006, ADR-0137); a new structural system widens the `ConstructionSystem` union additively. Then connect defaults to `resolvePeriod` so a Victorian-period project proposes balloon-framed lath and plaster for a new wall.
3. Per-layer rendering (#380) behind the finishes seam (ADR-0130): let `engine/scene/wall-builder.ts` consume the ordered layers rather than only the total, starting with either a 2D section symbol or a 3D material split at opening reveals.

### You have a result when

A real, dated survey plan (start from the committed corpus fixtures in `tests/fixtures/projects/corpus/`, for example the 1908 Radford cottage) can be traced using only registry assemblies, and every wall's drawn footprint in both the 2D symbol and the 3D shell equals the assembly's layer-sum with no hand-entered thickness. Falsified if most walls need the raw-thickness fallback: that means the registry vocabulary, not the model, is the gap, and the measured gap list is itself the next deliverable.

## Frontier 2: physically credible browser daylighting

### Why mainstream floor planners fall short

Browser floor planners treat lighting as decoration: a fixed sun, no location or time model, no color-management discipline, and no stated accuracy claim. "Will this paint read right in this room at 4 pm in November" is unanswerable in any of them.

### Vernacular's asset

A measurable lighting claim in a web floor planner: a color-managed pipeline with the accuracy bar written down before the result is claimed.

Shipped and pinned by pixel baselines as of 2026-07-05:

- Sun position from the NOAA solar algorithm in pure core, tests pinned to reference-implementation values (`core/environment/solar-position.ts`).
- Analytic sky model and sky dome (`core/environment/sky-model.ts`, `sky-dome.ts`) with a CPU spherical-harmonics light probe for the diffuse sky term (ADR-0148, `core/environment/spherical-harmonics.ts`).
- Color-managed renderer: sRGB output color space plus Khronos PBR Neutral tone mapping set at renderer creation (ADR-0142), and per-mode tone mapping, AgX in realistic mode, Neutral for schematic and the color check (ADR-0147).
- Ambient occlusion through the node-based render pipeline on the WebGPU renderer with WebGL 2 fallback (ADR-0151).
- A neutral color-check mode that strips sun and sky tints (`colorCheckLighting` in `core/environment/color-check.ts`, ADR-0146), pinned by the `scene-color-check` baselines in `e2e/tests/scene-solar.spec.ts-snapshots/` (darwin and linux; the linux CI lane is ADR-0152).
- Deterministic capture: the harness waits for sky, lighting, and ambient-occlusion readiness before the frame (ADR-0149).

The evidence bar is written, not improvised. The epic spec (`docs/specs/2026-07-01-realistic-environmental-lighting.md`) states the acceptance criterion: color-accurate enough to make interior-decorating decisions. Issue #449 states the headline gate: a known paint color rendered under neutral daylight reads within a stated tolerance of its reference swatch, and the gate must include an indirectly lit interior surface, because bounced daylight dominates perceived interior paint color.

Honest limits as of 2026-07-05: the tolerance has no number yet; #449 requires a luminance-calibration ADR (what sun intensity plus exposure means, the sun-to-sky ratio convention) before the gate is tuned. `finishId` is dead data: no file in `engine/` reads it, so paints render at default roughness. The gate is a stated bar, not a passed test. Do not claim color accuracy is achieved.

### First three steps in this repo

1. Issue #444 (spine slice 2): role-aware shadow casters so glazing transmits daylight. Without it, interiors get no direct sun through windows.
2. Issue #449, in its stated order: first the owed luminance-calibration ADR, then a `PhysicalMaterialProvider` at the material-provider seam (ADR-0067) wiring `finishId` to roughness, sheen, and specular, then the numeric color-accuracy gate including the indirectly lit surface.
3. Issue #450: the perceived-color readout (what a lit surface actually reads as), building on the conversions in `core/color/oklab.ts` and the neutral color check.

### You have a result when

The color-accuracy gate is a committed automated test with a number: a known paint rendered through the full realistic pipeline under the neutral color check reads within an ADR-documented tolerance of its reference swatch, measured in a stated color space, for both a direct-lit and an indirectly lit surface, and the test fails on any tone-mapping, color-space, or material regression. Falsified if no fixed tolerance holds without per-scene tuning; that outcome promotes the reserved path-traced photo mode (the spec's stated accuracy backstop), which is also a publishable finding.

## Frontier 3: open plan interchange

### Why mainstream floor planners fall short

Plan data in mainstream tools lives in proprietary binaries or vendor databases: not diffable, no public versioned schema, no migration story, no sanctioned extension point. Interchange degrades to lossy image or PDF export, and a user's plans die with the product.

### Vernacular's asset

A documented, versioned format published from an Apache-2.0 repository (see `LICENSE`), so the spec and schemas carry an open license:

- **Normative spec.** `docs/specs/2026-06-10-vernacular-floor-plan-format.md` (introduced by ADR-0047) uses RFC 2119 language and defines three packaging tiers: the plain-text `vernacular.json` Document (git-diffable, zero binary content), the working Folder with content-addressed `assets/<contentHash>.<ext>` (ADR-0007), and the shareable `.building` ZIP archive with a generated `ATTRIBUTIONS.md`.
- **Schema generated from the types.** The CORE JSON Schema is generated from `core/model/` and committed immutably under `schema/8/` through `schema/16/` (current version 16, `CURRENT_SCHEMA_VERSION` in `core/model/factories.ts`), drift-guarded by `pnpm schema:check`.
- **Migration ladder.** 15 registered schema migrations in `core/migrations/schema/index.ts` plus registry-level migrations under `core/migrations/registries/`. All five committed corpus fixtures are at schemaVersion 8, so loading them exercises the whole ladder.
- **Validation profiles.** Ajv Core profile (`core/format/validate-document.ts`), tolerant validation and a load gate (ADR-0051), and a Strict profile that validates reverse-DNS vendor extension namespaces against registered schemas (`core/format/strict-profile.ts`).
- **Preservation rule.** Processors must round-trip unknown `extensions` payloads and reserved keys byte-for-value (spec section 6.4, ADR-0051), and 20 reserved first-party names (section 6.5) keep future growth additive.
- **A deliberate BIM seam.** The Industry Foundation Classes and their ifcJSON serialization are explicitly not the native format; they are a reserved exporter and importer concern (spec sections 1 and 10, ADR-0044, `docs/delivery-strategy.md`). The exporter seam exists (`core/export/exporter.ts`, with SVG implemented under `core/export/svg/`). As of 2026-07-05 there is no `core/import/` directory and no IFC code; never claim IFC support exists.

### First three steps in this repo

1. Make the published schema resolvable. `schema/16/vernacular.schema.json` commits `$id` `https://drmrd.github.io/vernacular/schema/16/vernacular.schema.json`, but as of 2026-07-05 that URL redirects off-site and returns 404. Settling the spec's section 11 open question with live hosting is the cheapest external-credibility win.
2. Prove the spec stands alone: build a minimal second reader that consumes only `schema/<version>/` and the spec (zero `core/` imports), validates the committed fixtures (`tests/fixtures/projects/`, including `corpus/`), and round-trips an `extensions` payload byte-for-value, verifying the preservation rule from outside the codebase.
3. Run the ifcJSON exporter spike behind `core/export/exporter.ts`: map Document walls, openings, and derived rooms to their IFC counterparts. The delivery strategy names an ifcJSON exporter as the interoperability proof for the output track.

### You have a result when

Software sharing no code with this repo consumes Vernacular output: either an independent reader built from spec plus schema alone passes fixture round-trips including preservation, or an ifcJSON export of a corpus fixture loads in an independent viewer with walls, openings, and spaces intact. Falsified wherever the spec alone proves insufficient and a reader author must consult `core/` source; each such gap is a spec defect to file, and closing them is the contribution.

## Candidate frontier 4: derived-geometry editing

Owner-rated plausible, not confirmed. Treat every claim in this section as a hypothesis under evaluation, not a settled direction.

### The hypothesis

Fully derived topology (rooms computed from wall topology, nothing stored) plus command dispatch may be a stronger editing substrate for messy historic geometry than the stored-room models mainstream tools use: no stored geometry to drift out of sync, every edit undoable, out-of-square plans representable without cleanup passes.

### What the repo already holds

- Derived rooms via planar face enumeration (ADR-0026, `core/topology/rooms.ts`), with `customPolygon` on a room override as the explicit escape hatch, and "rooms are derived, not stored" a normative invariant of the published format.
- ADR-0097, an unusually thorough evaluation that already scoped DCEL adoption: what it buys (native hole handling, one shared vertex-fan traversal, a path to incremental invalidation), what it costs (statefulness in tension with the derived-not-serialized property), the trigger features (issue #80 curved walls and issue #78 courtyards, both open as of 2026-07-05), and the spike's success criteria. Its decision is defer.
- The snap architecture that makes derived topology editable on non-orthogonal plans: the drawing snap model (ADR-0033, `editor/plan/snap.ts`, `editor/plan/use-snapping.ts`), along-wall and intersection snaps (ADR-0053), smart angle snap (ADR-0054), precision preferences (ADR-0059), and free-angle endpoint edits (ADR-0074).

Honest limits: the wall-graph noding pass is O(n squared) and a DCEL does not fix it (ADR-0097 says so explicitly). Curved walls are unrepresentable today; the castle corpus fixture ships with zero walls for exactly that reason. The frontier is unproven.

### First three steps in this repo (evaluation, not adoption)

1. Do not start the adoption early. ADR-0097 defers until #80 or #78 is scheduled. When one is, run the pre-scoped spike: port `deriveRooms` to an explicit DCEL face walk on a throwaway branch and hold it to the ADR's bar (the hole-containment pass folds into faces; `core/topology/wall-footprint.ts` and `junction-fill.ts` share one fan traversal; a credible incremental-invalidation path; the derived-not-serialized property preserved).
2. Measure `customPolygon` pressure: as the corpus fixture set under `tests/fixtures/projects/corpus/` grows (tiers per ADR-0052), count rooms that need the override versus rooms the derivation gets right on real historic plans. Low pressure is evidence for the hypothesis; high pressure is evidence against it.
3. Benchmark the independent lever: profile `buildWallGraph` (`core/topology/wall-graph.ts`) noding at large wall counts. If scale pressure lives in the quadratic noding rather than in traversal, the fix is a spatial index behind the same signature, not a DCEL.

### You have a result when

The spike runs and is judged against ADR-0097's written bar, either way. Clearing the bar upgrades derived-geometry editing to a confirmed frontier (record the numbers in a follow-up ADR). Failing it retires the DCEL half of the claim and leaves derived-not-stored as an architecture strength rather than a research frontier. Until then this stays labeled candidate everywhere it is mentioned.

## Common mistakes

| Mistake                                                     | Reality check                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Claiming color accuracy is achieved                         | It is a stated gate. No numeric tolerance exists, the luminance-calibration ADR is owed, and `finishId` has zero readers in `engine/`        |
| Quoting the design spec's single-era wording                | ADR-0046 split period and style and is authoritative where the spec prose disagrees                                                          |
| Claiming IFC or ifcJSON support                             | Reserved seam only. No `core/import/`, no IFC code, as of 2026-07-05                                                                         |
| Assuming the published schema `$id` resolves                | It 404s after an off-site redirect as of 2026-07-05                                                                                          |
| Starting the DCEL adoption before #80 or #78 is scheduled   | ADR-0097's decision is defer; the spike is the entry point, and only at the trigger                                                          |
| Inventing a color tolerance number to make the gate pass    | The number belongs in the luminance-calibration ADR first (#449's stated order)                                                              |
| Naming third-party products in frontier or positioning text | Write "mainstream floor planners"; wording rules live with vernacular-docs-and-writing                                                       |
| Landing spike code without change control                   | Throwaway branches are fine for spikes; anything that merges follows the red-green-blue cycle and ADR gating (see vernacular-change-control) |

## Provenance and maintenance

All statuses, issue states, counts, and "no code exists" claims verified against the repo on 2026-07-05. Re-verify before relying on any of them:

- Issue states: `for i in 414 380 444 449 450 80 78; do gh issue view $i --json number,state,title -q '"\(.number) \(.state) \(.title)"'; done`
- Current schema version and ladder: `grep -n "CURRENT_SCHEMA_VERSION" core/model/factories.ts && ls schema/`
- Migration count (15 as of 2026-07-05): `awk '/SCHEMA_MIGRATIONS/,/^\]/' core/migrations/schema/index.ts | grep -c 'Migration,'`
- `finishId` still unread in engine (expect no output until #449 lands): `grep -rn finishId engine/`
- 2D symbol still on raw thickness (expect line 394 until #414 lands): `grep -n "wall.thickness" editor/plan/draw-plan.ts`
- Seeded profile count (4): `grep -c "id: '" core/registries/construction-profiles.ts`
- Seeded style count (32): `grep -cE "^  (academic|vernacular)\(" core/registries/styles.ts`
- Schema `$id` resolvability: `curl -sIL -o /dev/null -w "%{http_code}\n" https://drmrd.github.io/vernacular/schema/16/vernacular.schema.json`
- Anchor ADRs on disk: `ls docs/knowledge/decisions | grep -E "ADR-(0026|0033|0046|0047|0051|0052|0097|0137|0142|0147|0148|0149|0151|0152)"`
- Corpus fixtures: `ls tests/fixtures/projects/corpus/`
- Color-accuracy bar wording: `grep -n "color-accuracy" docs/specs/2026-07-01-realistic-environmental-lighting.md`
