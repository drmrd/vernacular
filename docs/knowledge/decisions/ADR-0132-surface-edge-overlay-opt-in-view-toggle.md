---
slug: decisions/ADR-0132-surface-edge-overlay-opt-in-view-toggle
title: 'ADR-0132: Surface edge overlay is an opt-in view toggle, off by default in Orbit'
type: decision
tags: [architecture, three-dimensional, rendering, edges, preview, view-settings, engine]
related:
  [
    decisions/ADR-0078-three-dimensional-preview-surface-edges,
    decisions/ADR-0066-three-dimensional-selection-and-accessibility,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
  ]
sourceFiles:
  [
    docs/knowledge/decisions/ADR-0078-three-dimensional-preview-surface-edges.md,
    engine/scene/edge-overlay.ts,
    engine/scene/build-scene.ts,
    engine/scene/floor-subgroups.ts,
    engine/scene/furniture-builder.ts,
    bridge/react/furniture-model-signals.tsx,
  ]
status: accepted
updated: 2026-06-29
---

# ADR-0132: Surface edge overlay is an opt-in view toggle, off by default in Orbit

## Status

Accepted. It amends one rule from
[[ADR-0078-three-dimensional-preview-surface-edges]]. That decision drew a dark
hidden-line overlay along every surface and kept it always on, with a user toggle
noted as a later addition. A reporter asked for the wireframe edges off by default in
the 3D view, with a way to turn them back on. This record flips the default and adds the
toggle seam (issue #258).

## Context

The surface edge overlay reads well for a drafting look, but always-on wireframe edges
are not the clean default the reporter wants in Orbit. ADR-0078 already anticipated a
preference to turn the overlay off and left the door open for it. The remaining
decisions are what the default is, where the on/off choice lives, and how to keep the
overlay applied consistently to walls, openings, and assets.

The overlay is a view concern, not model data. It styles the 3D view only and is never
saved to the project, so the toggle is a view setting that sits with the other 3D
display options rather than anything in the document.

## Decision

### The overlay is off by default and opt-in through a view option

The overlay no longer draws unconditionally. A view-level `EdgeOverlayOptions`
(`{ edgeOverlay?: boolean }`) carries the choice, and the default is off. The scene
build and the floor sub-group builders thread the option through and ask one shared gate,
`applyEdgeOverlay`, to draw the overlay only when the view turns it on. This keeps the
on/off decision in one place rather than scattering conditionals across the builders, and
it keeps the overlay available for the drafting-line look.

The toggle is applied the same way to walls, openings, and assets, so the whole view
turns its edges on or off together.

### The toggle is exposed in the scene-build options seam

The option lives in the scene-build options that `buildScene` and the floor sub-group
builders accept. The live Orbit path (the reconciler) builds with the default, so the
overlay is off in Orbit today. Wiring a real display-options control to flip the option
on is a follow-on; the seam is in place for it.

### A loaded furniture model is distinguished by a placeholder flag, not the overlay

The end-to-end model-swap signal used to tell a furniture massing box from a loaded model
by the box carrying the edge overlay while the model did not. With the overlay off by default
that test no longer holds, so the massing box now sets `userData.furnitureMassing`, and
the signal reads that flag instead. The flag is the stable marker the overlay had been
standing in for.

## Consequences

- Orbit shows clean surfaces by default; the drafting-line edges are one view option away.
- The on/off choice is one gate shared by the scene build and the sub-group builders, so
  walls, openings, and assets stay consistent.
- The overlay is a view setting, not model data; it is never persisted to the project.
- A display-options control that flips the toggle on is a recorded follow-on. The
  unloaded-asset massing box growing its own edges (issue #259) is a separate change that
  builds on the placeholder flag this record adds.

## Alternatives considered

- **Leave the overlay always on.** Rejected per the reporter: a clean default with an
  opt-in is preferred over the always-on drafting look.
- **Scatter an on/off check at each `addEdgeOverlay` call.** Rejected: one shared
  `applyEdgeOverlay` gate threaded from the scene-build options keeps the decision in a
  single place and keeps the builders unaware of the choice beyond passing it through.
- **Keep the overlay as the model-swap discriminator.** Rejected: with the overlay off by
  default the box no longer carries it, so a stable placeholder flag on the massing box is
  the dependable marker.

## References

- [[ADR-0078-three-dimensional-preview-surface-edges]]: the always-on overlay this record
  amends to an opt-in toggle, and the shared edge-line helper it builds on.
- Issue #258: surface edge overlay off by default in Orbit, with a toggle.
- Issue #259: the unloaded-asset massing box carrying its own edges, which builds on the
  placeholder flag added here.
