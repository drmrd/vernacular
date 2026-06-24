# Plan: live-link the A/B finish chip to the wall face on the plan (issue #316)

## Goal

When a wall is selected and its finish section shows the A/B face chips, the chip the
user is indicating (the selected chip, or a hovered chip) highlights the matching wall
face on the 2D plan. A is the wall's left face, B is the right face (the existing
`WallFinishSection` mapping). This gives a live link so the abstract A/B labels map to a
visible side on the plan.

Scope for this issue: chip -> plan (the primary direction). The reverse (hovering a wall
face on the plan highlighting the chip) is "where feasible" in the issue and needs
per-face hit-testing on the canvas; it is deferred to a follow-up issue.

## Design

A transient highlighted surface, parallel to the existing active surface, drives a
face-specific highlight band on the plan. The active surface (paint panel target) is left
untouched so painting behavior does not change.

1. `bridge/selection/surface-selection-store.ts`: add a `highlighted: SurfaceRef | null`
   slot with `getHighlightedSurface()`, `highlight(ref)`, `clearHighlight()`, notifying
   subscribers. Independent of `active`.
2. `bridge/react/surface-selection-context.ts`: add `useHighlightedSurface()` parallel to
   `useActiveSurface()`. Mutators reached through the existing `useSurfaceSelection()`.
3. `editor/plan/draw-surface-paint.ts`: `SurfacePaintLayer` gains
   `highlightedSurface: SurfaceRef | null`; `drawSurfacePaint` strokes a face band (the
   same left/right offset geometry `strokeBand` uses) in the brass accent for the
   highlighted wall face, drawn on top. Independent of whether the face is painted.
4. `editor/plan/use-surface-paint-layer.ts`: thread `highlightedSurface` from
   `useHighlightedSurface()` into the layer the canvas reads.
5. `editor/plan/wall-finish-section.tsx`: while the section is shown, highlight the
   selected face; switching the chip moves the highlight; unmounting clears it. Hovering a
   chip previews that face and reverts to the selected face on leave.
6. `editor/design-system/segmented.tsx`: add an optional `onHover?: (value | null)` that
   fires on pointer enter/leave per option, so the A/B chips can preview on hover. Other
   `Segmented` callers are unaffected (the prop is optional).

## Cycles (red-green-blue each)

1. Store: highlighted-surface slot + highlight/clearHighlight + subscription.
2. Draw: face-band highlight for the highlighted surface.
3. Wire: `WallFinishSection` highlights the selected face (set on select, clear on
   unmount); `useSurfacePaintLayer` threads the highlighted surface to the canvas.
4. Hover: `Segmented` reports hover; `WallFinishSection` previews the hovered face and
   reverts to the selected face on leave.

## Deferred (file a follow-up)

Reverse link: hovering/selecting a wall face on the plan highlights the matching A/B chip
in the inspector. Needs per-face hit-testing on the canvas.
