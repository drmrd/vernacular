---
slug: decisions/ADR-0041-phase-1-completion-boundary-finishing-slices
title: 'ADR-0041: Phase 1 completion boundary and the finishing slices (underlay persistence, DOM overlay and accessibility)'
type: decision
tags:
  [
    architecture,
    roadmap,
    phasing,
    phase-1,
    acceptance,
    persistence,
    assets,
    asset-cache,
    underlay,
    dom-overlay,
    accessibility,
    aria,
    keyboard,
    units,
    editor-preferences,
    construction-type,
  ]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0021-2d-plan-rendering-interaction,
    decisions/ADR-0022-storage-capability-detection,
    decisions/ADR-0029-schema-registry-migration-framework,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0039-dimensions-and-thickness-aware-area,
    decisions/ADR-0040-clipboard-and-transforms,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    ROADMAP.md,
    core/model/types.ts,
    storage/asset-cache.ts,
    editor/plan/use-underlay.ts,
  ]
status: current
updated: 2026-06-09
---

# ADR-0041: Phase 1 completion boundary and the finishing slices (underlay persistence, DOM overlay and accessibility)

## Status

Accepted, forward-looking. No feature code lands with this decision; it records
where the Phase-1 two-dimensional plan editor actually finishes against its own
acceptance bar, and adds two small finishing slices to close the gap. The slices
implement in their own red-green-blue cycles with their own plans; this ADR is
the architectural record that the twelve build slices, though individually
complete, do not by themselves satisfy the design specification's Phase-1
acceptance, and that the roadmap should say so.

## Context

The two-dimensional plan editor was delivered as twelve build slices (wall
topology, units, pan/zoom, snapping, selection, wall editing, openings, room
naming, dimensions, clipboard and transforms, project stores, image underlay).
All twelve are implemented and tested, and the stack's roadmap marks the editor
"feature-complete for Phase 1."

Reviewing the slice deferrals against design specification section 10 (the
authoritative Phase-1 deliverable and acceptance list) shows three named Phase-1
items that the per-slice deferrals left open:

1. **"Project survives close/reopen with zero state loss"** is a named Phase-1
   acceptance test. It does not hold for underlays: the image-underlay slice
   (ADR-0037) holds the decoded raster in memory for the session only, because
   the content-addressed asset pipeline (`AssetCache` writeback and load
   resolution) is not yet wired, so an underlay does not survive a save and
   reopen. Image-underlay tracing is a marquee capability for the historic and
   old-house audience, so silently losing it on reload is a real regression
   against the acceptance bar, not cosmetic.

2. **"Pan/zoom Canvas + DOM overlay"** names a DOM overlay as a Phase-1
   deliverable (section 10), and the specification ties the editor's accessibility
   to it: the DOM overlay carries selection rings, dimension chips, snap
   indicators, and hover tooltips (section 6.2, "DOM overlay (React) for
   interactive UI"), with ARIA labels, focus management, and keyboard navigation
   (section 6.13). Slices 3, 4, 6, 8, and 9 each deferred the overlay and
   painted on the Canvas instead. The Canvas rendering delivers the visual
   function, but the DOM overlay and therefore the Phase-1 editor-accessibility
   deliverable are absent.

3. **"Wall editing (endpoint move, thickness, construction type)"** names
   construction type as a Phase-1 deliverable. Wall editing (ADR-0035) deferred it
   to the old-house architectural vocabulary milestone (Phase 4), which owns the
   construction-type registry and era-aware catalogs.

The question is whether to keep calling Phase 1 complete, or to acknowledge these
named items and close the ones that are genuine acceptance criteria before
turning to Phase 2.

## Decision

### Phase 1 finishes only after two small finishing slices

The twelve build slices stand. Phase 1 is declared complete only after two
finishing slices close the two named acceptance items above that the build slices
left open. They are deliberately scoped to the minimum that satisfies the
specification, not a re-architecture.

**Slice 13 - Minimal underlay asset persistence.** Wire `AssetCache` writeback and
load resolution behind the existing content-addressed `Underlay.image`
(`AssetReference`) so an underlay's raster persists with the project and resolves
on reopen, satisfying "zero state loss." The model already references the raster
by content hash (ADR-0037), so this is a storage-side change behind the same
reference: the decoded bytes are written to the project store's asset area on
placement (or save) and resolved back into the in-memory load
(`editor/plan/use-underlay.ts`) on open. It is intentionally a thin,
forward-compatible subset of the full asset-and-pack pipeline (which remains
Phase 3, owns `previews/` and `ATTRIBUTIONS.md`, library packs, and quota and
eviction); slice 13 writes only what an underlay needs.

**Slice 14 - DOM overlay and accessibility.** Add the React DOM overlay that
mirrors the Canvas world matrix with CSS transforms, carrying the interactive UI
the specification names (selection rings, dimension chips, snap indicators, hover
tooltips) with ARIA labels, focus management, and keyboard navigation. The Canvas
stays the renderer; the overlay is an additive, accessible, styleable chrome
layer over it, consistent with the Canvas-drawing seam (ADR-0021) the build
slices established. Because the formatters already exist (units slice) and the
overlay is where labels live, unit-aware ruler and dimension labels and a
project-level unit-display toggle (metric or imperial) ride this slice; they are
cheap, and they directly serve the Phase-1 goal that "the 2D plan editor is
genuinely useful for single-floor planning" for an audience that thinks in feet
and inches.

### Construction type is an accepted Phase-4 carve-out

Construction-type wall editing stays deferred to Phase 4, where the
construction-type registry and era-aware catalogs live; pulling it into Phase 1
would mean building that registry early. This is recorded as a conscious carve-out
of a named Phase-1 deliverable rather than left implicit, so the roadmap does not
silently drop it.

### Editor preferences beyond unit display are tracked follow-ups, not gates

Snap-settings UI (per-kind toggles and a configurable threshold), default ceiling
height, and default wall thickness are listed in the specification as a general
editor-preferences capability, not as named Phase-1 acceptance items. They are
tracked as Phase-1 follow-ups and do not gate completion. Only the unit-display
toggle and unit-aware labels (slice 14) are pulled in, because they bear directly
on whether the editor is usable for the target audience.

## Consequences

- The roadmap stops claiming unqualified "feature-complete for Phase 1" while a
  named acceptance criterion (zero state loss) is unmet and a named deliverable
  (DOM overlay with accessibility) is absent; it states the finishing slices as
  the true completion gate.
- Underlays survive reload, so the acceptance test holds and a marquee old-house
  workflow (trace a scanned plan, then save) actually works. The change is
  forward-compatible with the Phase-3 asset pipeline; that work extends, not
  reworks, slice 13.
- The editor gains its accessibility surface (ARIA, focus, keyboard navigation)
  and unit-aware labels, both Phase-1 expectations, before Phase 2 builds on the
  editor.
- Two small, well-bounded slices are added; Phase 2 (3D preview) starts after
  they land. The construction-type carve-out and the editor-preferences follow-ups
  are recorded so nothing named in the specification is lost.

## Alternatives considered

- **Declare Phase 1 done at the twelve build slices and push every gap to later
  phases.** Rejected: it leaves a named acceptance test failing and a named
  deliverable absent while asserting completion, which misrepresents status and
  risks the gaps being lost across five separate per-slice deferral lists.
- **Build the full asset-and-pack pipeline now to persist underlays.** Rejected as
  oversized: the pipeline (library packs, `previews/`, attributions, quota and
  eviction) is genuinely Phase-3 work. A thin writeback behind the existing
  content-addressed reference satisfies the acceptance criterion without pulling
  Phase 3 forward.
- **Re-architect rendering from the Canvas to the DOM overlay.** Rejected: the
  Canvas remains the renderer; the overlay is additive accessible chrome that
  mirrors it, which is what the specification describes.
- **Pull construction type into Phase 1.** Rejected: it requires the Phase-4
  construction-type registry; deferring it (recorded) is cheaper and keeps the
  finishing milestone small.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`, section 10
  Phase 1 deliverables and acceptance ("zero state loss"; "Pan/zoom Canvas + DOM
  overlay"; "construction type"), the DOM-overlay interactive-UI note (section
  6.2), the accessibility section (section 6.13), and the editor-preferences
  capability list.
- Implementation plan:
  `docs/plans/2026-06-09-phase-1-finishing-underlay-persistence-and-overlay-accessibility.md`.
- ADR-0007 (content-addressed assets the underlay reference uses), ADR-0021 (the
  Canvas plan-drawing seam the overlay layers over), ADR-0022 and ADR-0029
  (storage capability and migration framework), ADR-0035 (wall editing, which
  deferred construction type), ADR-0037 (image underlay, whose session-only raster
  this closes), ADR-0038, ADR-0039, ADR-0040 (the other build slices whose
  deferrals this consolidates).
