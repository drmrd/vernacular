---
slug: decisions/ADR-0066-three-dimensional-selection-and-accessibility
title: 'ADR-0066: Selection and accessibility for the three-dimensional preview: shared store, pure pick, reconciled luminance outline'
type: decision
tags:
  [
    architecture,
    rendering,
    three-d-preview,
    selection,
    hit-testing,
    raycaster,
    accessibility,
    a11y,
    aria-live,
    color-blind-safe,
    highlight,
    dom-proxy,
    roving-tabindex,
    bridge,
    engine,
    view-state,
    react-three-fiber,
    testing,
    semantic-e2e,
  ]
related:
  [
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
  ]
sourceFiles:
  [
    docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md,
    docs/plans/2026-06-13-three-dimensional-selection-and-highlight.md,
    engine/scene/pick-entity.ts,
    engine/scene/selection-outline.ts,
    bridge/react/scene-selection.tsx,
    bridge/react/scene-overlay.tsx,
    bridge/react/webgpu-scene-view.tsx,
  ]
status: current
updated: 2026-06-13
---

# ADR-0066: Selection and accessibility for the three-dimensional preview: shared store, pure pick, reconciled luminance outline

## Status

Accepted. This is the selection and accessibility slice of the three-dimensional
preview track ([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]),
foundation slice 7, taken as the user-facing sixth slice, on top of the navigable lit
shell ([[ADR-0065-three-dimensional-lighting-and-color-temperature]],
[[ADR-0064-three-dimensional-camera-navigation]],
[[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]). It is delivered
in two pull requests (6a selection and highlight, 6b accessibility proxies) against
one specification (`docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md`).

## Context

The shell renders, lights, and navigates, but nothing in it can be selected and the
canvas is opaque to assistive technology. The foundation pinned the shape of the
answer: every renderable carries `userData.entityId` (section 5.1), selection state
is shared and lives in the bridge outside undo (section 5.3,
[[ADR-0020-bridge-owned-selection-outside-undo]]), and the accessibility surface is a
DOM proxy layer with a roving tab order, live announcements, and a color-blind-safe
highlight (section 5.7). The decisions here are how to pick, where the pick lives,
how to highlight without fighting shared materials, and how to give an opaque canvas
an accessible surface.

## Decision

### Selection is the shared bridge store, so sync is a property, not a feature

The three-dimensional pane reads and writes the one bridge selection store that the
two-dimensional plan already uses. Selecting in three dimensions calls `select` or
`toggle` on that store; the plan, subscribed to it, re-renders. There is no
three-dimensional selection state and no synchronization layer: sharing the store is
the synchronization. This follows the foundation's view-state rule (section 5.3) and
keeps selection persisted and shared while the camera stays per-view session state.

### The pick is pure engine, the browser half is glue

Turning a pointer into an entity id is a ray against the built geometry, nearest hit
first, reading `userData.entityId` off the hit or its nearest ancestor that carries
one. Three.js raycasting is geometry math with no graphics context, so the pick is
`pickEntityId(raycaster, root)` in `engine/`, unit-tested in Node against a built
scene. Resolving to the nearest ancestor's id means a hit on any sub-mesh of a
multi-part entity (a wall with reveal faces, a room shell with a slab and a ceiling)
returns the one entity id. The bridge owns only the browser half: read the pointer
position, build normalized device coordinates, set the shared raycaster from the
camera, call the pure pick, and update the shared selection. That half is
coverage-excluded glue proven end to end.

### The highlight is a reconciled luminance outline, not a material change

The selected entity reads through a high-contrast outline drawn by luminance rather
than a hue tint, which satisfies the color-blind-safe requirement and reads over lit
surfaces (foundation 5.7 rejects the hue-only selection blue). The outline is a
separate, reconciled overlay, not a mutation of the entity's materials. The material
provider caches one material per surface role and shares it across many meshes
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]],
[[ADR-0065-three-dimensional-lighting-and-color-temperature]]), so tinting a material
to highlight one wall would highlight every wall sharing that role. Building the
outline as its own edge-line objects, reconciled against the selected ids and the
current geometry, keeps the base meshes untouched and lets the highlight survive the
wholesale scene rebuild (foundation 5.5) rather than being baked into discarded
materials. The outline lives in `engine/` (it is Three.js geometry) behind a small
reconcile the view drives on selection or geometry change.

### The accessibility surface reuses the plan overlay's shape

The opaque canvas gets the same accessible surface the two-dimensional plan already
uses: a DOM `listbox` of focusable, labeled `option` proxies with a roving tab order,
and a polite live region driven by the shared selection store, reusing the plan
overlay's `selectionAnnouncement`. The one difference is projection. The plan overlay
positions proxies through a static viewport; the three-dimensional camera moves, so
each proxy is positioned from the camera projection and repositioned as the camera
orbits or walks. The proxy layer takes no pointer events, so the pointer pick stays
on the canvas; the proxies are the keyboard and screen-reader surface. This lands in
part 6b.

### Delivery in two parts

6a ships the pick, the shared-selection glue, and the outline (the pane becomes
selectable and the selection shows in the plan). 6b ships the proxy listbox, its
camera-projected positions and roving tab order, and the live region (the pane
becomes reachable by keyboard and screen reader). Each part is its own plan and
red-green-blue cycle, so each lands as a coherent, reviewed unit.

## Consequences

- The three-dimensional pane is selectable by pointer, and the selection is shared
  with the plan with no new synchronization code, because both views drive the one
  bridge store.
- The pick is pure, deterministic engine code, unit-tested in Node; only the pointer
  translation is glue.
- The selected entity reads by luminance contrast, not hue, and the highlight does
  not disturb shared materials and survives scene rebuilds because it is a reconciled
  overlay.
- The opaque canvas gains a keyboard and screen-reader surface that mirrors the plan
  overlay, so a user navigates and selects entities in three dimensions without a
  pointer, and a selection is announced once across both views.
- No model, scene-graph, file-format, or migration change: the slice adds engine pick
  and outline functions, bridge glue, and a view-layer proxy layer; selection state
  was already shared and persisted.

## Alternatives considered

- **Give the three-dimensional pane its own selection state and sync it to the plan.**
  Rejected: the foundation makes selection shared in the bridge (section 5.3); a
  second store would need synchronization that using the one store avoids entirely.
- **Raycast in the bridge with React Three Fiber's object event handlers.** Rejected:
  the meshes are built imperatively and mounted as a primitive, not authored as
  React Three Fiber elements with handlers, and the pick logic is worth unit-testing
  in Node. A pure engine `pickEntityId` plus a thin pointer listener keeps the
  correctness testable and the bridge free of a draw dependency.
- **Highlight by mutating the selected mesh's material (emissive or color).**
  Rejected: materials are cached and shared per surface role, so mutating one would
  highlight every mesh sharing the role; a per-mesh material clone would also have to
  be restored across the wholesale rebuild. A separate reconciled overlay is simpler
  and rebuild-safe.
- **Highlight with a hue tint (the current two-dimensional selection blue).**
  Rejected by the foundation (section 5.7): hue-only does not satisfy the
  color-blind-safe requirement and reads weakly over lit three-dimensional surfaces.
  A luminance outline reads without color discrimination.
- **A postprocessing outline pass.** Rejected for now: it pulls in an effect composer
  and a separate render target, beyond the forward-rendering feature set the track
  holds to (foundation 5.6). Edge-line overlays achieve a luminance outline within
  forward rendering.
- **Skip the accessibility proxies and rely on the two-dimensional overlay.**
  Rejected: the design specification makes the three-dimensional view keyboard
  navigable with screen-reader announcements a day-one requirement (sections 6.13 and
  7.9); the opaque canvas needs its own proxy surface.

## References

- Slice specification `docs/specs/2026-06-13-three-dimensional-selection-and-accessibility.md`.
- Implementation plans `docs/plans/2026-06-13-three-dimensional-selection-and-highlight.md` (6a) and the 6b plan.
- Design specification `docs/specs/2026-06-01-vernacular-design.md`: sections 6.5,
  6.9, and 6.13.
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  sections 5.1, 5.3, 5.7, and 6.
- [[ADR-0020-bridge-owned-selection-outside-undo]]: the shared selection store both
  views drive.
- [[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]: the
  `userData.entityId` the pick reads and the shared per-role materials the highlight
  must not mutate.
