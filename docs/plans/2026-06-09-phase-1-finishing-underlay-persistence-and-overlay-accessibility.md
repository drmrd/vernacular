# Phase 1 finishing slices: underlay persistence, DOM overlay and accessibility

Slice-level scope plan for the two finishing slices that close the design
specification's Phase-1 acceptance gaps left open by the twelve build slices. See
ADR-0041 for the decision and rationale. Each slice gets its own full
behavior-by-behavior implementation plan (writing-plans skill) and red-green-blue
cycle when it is picked up; this document fixes scope, dependencies, and
acceptance so the boundary is unambiguous.

## Why these two

Design specification section 10 names, for Phase 1: "Project survives close/reopen
with zero state loss" (acceptance) and "Pan/zoom Canvas + DOM overlay"
(deliverable, with ARIA/focus/keyboard-nav accessibility tied to the overlay). The
build slices deferred underlay raster persistence (ADR-0037) and the DOM overlay
(slices 3/4/6/8/9), so neither holds today. These two slices close them. Construction
type stays a Phase-4 carve-out; editor preferences beyond unit display stay
tracked follow-ups (ADR-0041).

## Slice 13 - Minimal underlay asset persistence

**Goal.** An underlay's raster survives save and reopen, so a project with a
traced underlay satisfies "zero state loss."

**Approach.** The raster is already referenced by content hash through
`Underlay.image: AssetReference` (`core/model/types.ts`). Wire the storage round
trip behind that reference:

- On underlay placement (or on save), write the decoded bytes to the project
  store's asset area through `AssetCache` (`storage/asset-cache.ts`), keyed by the
  content hash already in `Underlay.image`.
- On open, resolve `Underlay.image` through `AssetCache` back into the in-memory
  load path (`editor/plan/use-underlay.ts`), so the underlay paints after reload.
- Keep it a thin subset: write only what an underlay needs. No `previews/`, no
  `ATTRIBUTIONS.md`, no library packs, no quota/eviction UI; those stay Phase 3.

**Dependencies.** Slice 11 (project stores, `AssetCache` available) and slice 12
(underlay model and load) are on `main`. No schema change is required (the
reference field already exists); confirm during planning whether asset bytes live
under the project store's `assets/` area or the `AssetCache` and align with
ADR-0007 and the storage ADRs.

**Acceptance.** Place an underlay, calibrate it, save, reopen: the underlay
reappears at its calibrated placement and opacity. A round-trip test
(load -> save -> load) preserves the underlay including its raster.

**Deferred (still Phase 3 or later).** Full asset-and-pack pipeline, previews and
attributions, large-raster quota and eviction, PDF and glTF underlays, underlay
selection and hit-testing, move/rotate gizmos.

## Slice 14 - DOM overlay and accessibility

**Goal.** Deliver the named DOM overlay and the Phase-1 editor accessibility
(ARIA labels, focus management, keyboard navigation), plus unit-aware labels.

**Approach.** Add a React DOM overlay positioned over the plan Canvas that mirrors
the Canvas world matrix with CSS transforms. The Canvas stays the renderer; the
overlay adds an accessible, styleable interactive layer:

- Move (or mirror) interactive chrome onto the overlay: selection rings, dimension
  chips, snap indicators, hover tooltips.
- Accessibility: ARIA roles/labels on selectable entities and inspector controls,
  managed focus, and keyboard navigation of selection and tools, consistent with
  the specification's accessibility section.
- Unit-aware labels: replace the raw-millimetre ruler labels (slice 3 deferral)
  and feed the room and dimension labels through the existing unit formatters
  (slice 2), driven by a project-level unit-display toggle (metric or imperial).

**Dependencies.** The Canvas plan-drawing seam (ADR-0021) and the unit formatters
(slice 2) are on `main`. The overlay reuses the bridge-owned selection
(ADR-0020). During its brainstorm, decide whether the overlay subsumes the Canvas
chrome or mirrors it, and whether it decomposes into more than one cycle (it is the
larger of the two finishing slices).

**Acceptance.** Selection, dimensions, and snapping are operable and labeled via
the DOM overlay; keyboard-only navigation reaches selection and tools; ruler and
label values render in the project's chosen units (for example `1 m` or `3' 4"`).
Existing Canvas rendering and the wall-drawing end-to-end flow stay green.

**Deferred (later polish).** Snap-settings UI, default ceiling height and wall
thickness preferences, label-collision avoidance, animated/inertial camera, and
the DOM-overlay variants of gizmos beyond what accessibility needs.

## Out of scope for both

3D, furniture, old-house vocabulary (including construction type), multi-floor,
paint. After both land, Phase 1 is complete and Phase 2 (3D preview) begins.
