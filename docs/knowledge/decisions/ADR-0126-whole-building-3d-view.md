---
slug: decisions/ADR-0126-whole-building-3d-view
title: 'ADR-0126: Whole-building 3D view stacks every floor at the bridge seam'
type: decision
tags: [3d-preview, scene-graph, bridge, floors, elevation, session-state]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0018-scene-graph-derivation,
    decisions/ADR-0057-three-dimensional-preview-as-a-view-mode,
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0075-three-dimensional-preview-camera-fit,
    decisions/ADR-0088-three-dimensional-incremental-scene-updates,
  ]
sourceFiles:
  [
    bridge/react/view-scene-graph.ts,
    bridge/react/use-building-view-state.ts,
    bridge/react/use-view-scene-graph.ts,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/webgpu-scene-view.tsx,
  ]
status: current
updated: 2026-06-27
---

# ADR-0126: Whole-building 3D view stacks every floor at the bridge seam

## Status

Accepted, landed. The 3D navigation toolbar carries a view-scope toggle. "This floor" keeps the
single-floor preview that was there before. "Whole building" renders every floor stacked at its own
elevation as one model, with a control to show or hide the underground levels. The active floor is the
default, so the preview behaves exactly as it did until the viewer asks for the combined model.

## Context

The 3D preview shows one floor at a time. The view subscribes to the active floor and narrows the scene
graph to it with `sceneGraphForFloor` before building the Three.js tree (ADR-0057, ADR-0018). That is the
right default for working on a single level, but it gives no way to see how the floors line up, how the
massing reads, or how stairs and shafts connect between levels (#206). A renovator drawing a four-storey
house with a basement needs the levels together to judge any of that.

The scene graph already carries every floor. `deriveSceneGraph` projects all of them, and `buildScene`
already builds one group per floor node and seats it at the node's elevation (in millimetres, no scale
factor). The single-floor view is a filter applied on top of that whole graph, not a separate render path.
So the combined model is not new geometry; it is the whole graph the per-floor view was hiding.

Floors carry no explicit "basement" flag. The model places below-grade levels at negative elevations: the
ground floor sits at the zero datum, upper floors stack upward, and basements descend to negative
elevations. "Underground" is therefore a property of elevation, not a stored kind.

## Decision

The whole-building projection is a pure function at the bridge view seam, `sceneGraphForBuilding`, the
mirror of core's `sceneGraphForFloor`. It returns the whole graph with the floors stacked, and when the
view hides underground levels it drops every floor whose node elevation is below the ground datum, along
with all of that floor's walls, rooms, openings, dimensions, stairs, and furniture. A `viewSceneGraph`
selector picks between the two: the active-floor graph in floor scope, the building graph in building
scope.

Both functions live in the bridge layer next to where the per-floor narrowing is already consumed, not in
core. The bridge owns the decision of which graph the live view renders, and putting the building selector
beside that decision keeps the choice in one place. The functions take only the scene-graph types and the
floor-node prefix that core already exports, so no new core surface is introduced for the view to reach.

The scope and the underground visibility are session view state, held in `useBuildingViewState` in the
view layer and never in the model or undo, the same as the camera mode and color temperature (ADR-0001).
The state seeds the active-floor scope with underground levels shown. The toolbar renders a segmented
scope toggle and an underground-levels toggle; the underground toggle is disabled in floor scope, where it
has no meaning, since the filter only applies to the combined model.

Standard orbit, pan, and zoom come for free. The camera frames whatever world bounds the built scene
reports (ADR-0075), so the taller bounds of a stacked building fit the frame the same way a single floor
does, and the navigation modes and presets (ADR-0064, ADR-0083) read those same bounds. The view feeds the
selected graph through the existing reconciler (ADR-0088), so switching scope or toggling underground
rebuilds the scene only when the scoped graph actually changes.

### Rejected: a new whole-building render path in the engine

Building the combined model with new engine code was rejected because `buildScene` already builds every
floor node at its elevation. The per-floor view is a filter, so the unified view is the absence of that
filter, not a second renderer. Reusing the one builder keeps the two views pixel-identical for any floor
they share and leaves a single place to fix the cross-level issues the combined view surfaces (#196, #197,
#198).

### Rejected: a stored basement flag on the floor

Marking floors as underground in the model was rejected because elevation already encodes it. A below-grade
level is one seated below the zero datum, which the floor-placement defaults already produce, so the filter
reads the elevation the floors carry rather than a redundant flag that could drift out of step with it.

## Consequences

- The single-floor preview is unchanged: floor scope is the default and still narrows through
  `sceneGraphForFloor`. The committed scene visual baselines render a fixed harness scene, not the live
  toggle, so they do not move.
- The combined view surfaces the cross-level rendering issues the request named: stairwell openings (#196),
  gaps at angled wall corners (#197), and transparent slab edges (#198). They show most clearly here and are
  tracked separately. The ground plane and exposed-foundation work (#207) builds on this view.
- In building scope the accessibility proxies and the doorway preset read every floor's entities rather than
  one floor's, since they consume the same selected graph. That widens their reach to the whole building,
  which suits the combined view.
- Adding a third scope later (for example, a chosen range of floors) is a new branch in `viewSceneGraph` and
  a new graph filter beside the two that exist, without touching the renderer or the camera.

## References

- ADR-0001 (the layer boundaries that keep the scope and underground state at the bridge seam).
- ADR-0018 (the scene-graph derivation that already projects every floor).
- ADR-0057 (the 3D preview view mode and its active-floor scoping).
- ADR-0064 (the orbit and walk navigation the combined model reuses).
- ADR-0075 (the camera fit to world bounds that frames the taller building).
- ADR-0088 (the incremental reconciler the selected graph feeds).
- Issues: #206 (view the whole building as one model); related #196, #197, #198, #207.
