# Three-Dimensional Selection Sync and Accessibility

**Date:** 2026-06-13
**Status:** Accepted (selection and accessibility slice of the three-dimensional preview track)
**Scope:** Makes the three-dimensional pane selectable and accessible: a pointer
pick selects the entity under the cursor, the selection is shared with the
two-dimensional plan, the selected entity reads with a color-blind-safe highlight,
and an assistive-technology surface gives the opaque canvas a focusable, labeled,
announced proxy for each entity. It builds against the track foundation
(`docs/specs/2026-06-09-three-dimensional-preview-foundation.md`), in particular the
mesh-to-entity identity rule (foundation 5.1), the shared selection state
(foundation 5.3, ADR-0020), and the accessibility seam (foundation 5.7). The
decisions specific to this slice live in ADR-0066. This is foundation slice 7,
taken as the user-facing sixth slice.

The shell is navigable and lit but inert: nothing in it can be selected, and the
canvas is opaque to a screen reader. This slice closes both gaps. It is delivered in
two parts so each lands as a coherent, shippable unit:

- **Part 6a (selection and highlight):** the pointer pick, the shared selection, and
  the highlight.
- **Part 6b (accessibility proxies):** the focusable DOM proxy layer, the roving tab
  order, and the live-region announcements.

---

## 1. Goal

After this slice:

- **Click to select.** A pointer press on the three-dimensional canvas selects the
  entity under the cursor (a wall, a room, an opening). A modifier press adds to or
  removes from the selection; a press on empty space clears it.
- **Selection is shared.** A selection made in the three-dimensional pane shows in
  the two-dimensional plan and the reverse, because both views read and write the one
  bridge selection store. No new synchronization machinery is added.
- **The selection reads without color vision.** The selected entity carries a
  high-contrast outline that reads by luminance, not hue, so it satisfies the
  color-blind-safe requirement and reads over lit surfaces.
- **The canvas is reachable by keyboard and screen reader.** A DOM proxy layer over
  the canvas carries one focusable, labeled element per selectable entity, with a
  roving tab order, and a live region announces the current selection. The render
  stays on the canvas; the proxies are the accessible surface, the same shape the
  two-dimensional plan overlay already uses.

---

## 2. Selection is the shared bridge store

Selection state already lives in the bridge, outside undo, shared by both renderers
(ADR-0020, foundation 5.3). The store exposes `select`, `toggle`, `setSelection`,
`clear`, `isSelected`, `getSelectedIds`, and `subscribe`. The two-dimensional plan
already reads it through `useSelectionIds` and writes it from its hit-test and its
overlay proxies.

So the three-dimensional pane does not get its own selection. It reads the same
store and writes the same store. Selecting a wall in three dimensions calls
`select(wallId)`; the two-dimensional overlay, subscribed to the same store,
re-renders with that wall selected. Synchronization is not a feature this slice
builds; it is a property of using the shared store from both views. This is the
whole of "selection sync."

---

## 3. Picking: a ray to an entity id

Every renderable object carries its entity id in `userData.entityId` (foundation
5.1; the wall, room, and opening builders set it). Picking turns a pointer position
into that id.

The pick is pure processor work: a ray against the built geometry, nearest hit
first, reading the entity id off the hit object or its nearest ancestor that carries
one. It has no graphics-context dependency (Three.js raycasting is geometry math, not
a draw), so it lives in `engine/` as `pickEntityId(raycaster, root): string | null`
and is unit-tested in Node against a built scene. Returning the nearest ancestor's id
means a hit on any sub-mesh of a multi-part entity (a wall with reveals, a room shell
with a floor slab and a ceiling) resolves to the one entity id.

The bridge glue owns the browser half: it reads the pointer position from the canvas
pointer event, turns it into normalized device coordinates, sets the shared raycaster
from the camera, calls `pickEntityId`, and updates the shared selection. A plain
press selects the hit (or clears on a miss); a modifier press toggles the hit into or
out of the selection. This half runs only under a real render, so it is
coverage-excluded glue, proven end to end.

---

## 4. The selection highlight

The selected entity must read without relying on hue (foundation 5.7: a fixed
selection blue does not satisfy the color-blind-safe requirement and reads weakly as
a tint over lit surfaces). The highlight is a high-contrast outline drawn by
luminance: bright edges traced along the selected geometry, which read against both
light and dark surfaces because the cue is contrast, not color.

The outline is a separate, reconciled overlay, not a change to the entity's
materials. The material provider caches one material per surface role and shares it
across many meshes (the neutral and paint materials), so mutating a material to
highlight one wall would highlight every wall that shares the role. Instead, the
highlight is its own set of edge-line objects, built for the meshes whose entity id
is selected and cleared when the selection changes. Keeping the base meshes untouched
also means the highlight survives the wholesale scene rebuild (foundation 5.5): the
overlay is reconciled against the current selection and the current geometry, rather
than being baked into materials that the rebuild discards.

The highlight is realized in `engine/` (it is Three.js geometry) behind a small
reconcile function the view drives when the selection or the geometry changes. The
outline color is a fixed high-luminance value chosen for contrast, not a hue the user
must distinguish.

---

## 5. The accessibility proxy layer

A WebGPU canvas is a single opaque element; a screen reader sees nothing inside it,
and the keyboard cannot reach the entities. The two-dimensional plan already solved
the analogous problem with a DOM overlay of focusable entity proxies, a roving tab
order, and a live region (`editor/plan/plan-overlay.tsx`,
`editor/plan/use-overlay-keyboard.ts`, `editor/plan/overlay-announce.ts`). The
three-dimensional pane reuses that shape.

- **Proxies.** A layer over the canvas holds one focusable, labeled element per
  selectable entity, in a `listbox` of `option`s, with a roving tab order (one
  element in the tab sequence at a time, arrow keys moving focus), exactly as the
  plan overlay does. Activating a proxy selects its entity through the shared store;
  the same modifier rules as the pointer apply.
- **Position.** Each proxy is positioned at the entity's projected screen location.
  The plan overlay projects through a static two-dimensional viewport; the
  three-dimensional camera moves, so each entity's projected position changes as the
  camera orbits or walks. The proxies are repositioned from the camera projection,
  updated when the camera moves, so a proxy tracks its entity on screen. The proxy
  layer does not take pointer events (the pointer pick stays on the canvas, section
  3); it is the keyboard and screen-reader surface.
- **Announcements.** A polite live region announces the current selection, driven by
  the shared selection store, reusing the plan overlay's `selectionAnnouncement` so a
  selection made in either view announces once and reads the same way.

The highlight encoding (section 4) and the proxy layer together are the
accessibility surface foundation 5.7 names: a focusable proxy per entity, a roving
tab order, live announcements, and a color-blind-safe highlight.

---

## 6. Delivery in two parts

The slice lands in two pull requests against one specification and one decision
record:

- **6a:** `pickEntityId` in the engine, the bridge pointer glue that writes the
  shared selection, and the reconciled outline highlight. After 6a the pane is
  selectable by pointer, the selection is shared with the plan, and the selected
  entity is outlined.
- **6b:** the DOM proxy listbox over the canvas, its camera-projected positions and
  roving tab order, and the live-region announcement. After 6b the pane is reachable
  by keyboard and screen reader.

Each part carries its own implementation plan and red-green-blue cycle.

---

## 7. Testing

- **Pure engine, in Node.** `pickEntityId` is tested against a built scene: a ray
  that strikes a wall returns the wall id; a ray into empty space returns null; a ray
  that strikes a sub-mesh of a multi-part entity returns the entity id. The highlight
  reconcile is tested against a built scene and a selection set: the overlay carries
  edge geometry for the selected entities and nothing for the unselected, and
  reconciling to a new selection clears the old outline.
- **View-layer glue, proven end to end.** The pointer pick, the proxy projection, and
  the live-region wiring run only under a real render, so they stay coverage-excluded
  glue (foundation 6.3). A scene-webgl end-to-end test drives a pointer press on the
  drawn shell and asserts the shared selection changed (and that the two-dimensional
  plan reflects it). The keyboard and announcement behavior is exercised the way the
  plan overlay's accessibility specs exercise theirs.
- **Visual tier.** The committed shell baseline gains a selected-entity variant so the
  outline is reviewed against a fixed image, the same way the warm-temperature
  baseline records the tint.

---

## 8. Out of scope

- **Gizmos and transform handles in three dimensions.** Selection and highlight only;
  moving or editing an entity from the three-dimensional pane is not here.
- **Surface (sub-entity) selection in three dimensions.** Selecting one wall face for
  painting is the paint track's; this slice selects whole entities by their
  `userData.entityId`.
- **Hover preview highlighting.** Only the committed selection is highlighted, not a
  transient hover.
- **A picking acceleration structure.** The shell is small enough for a direct
  raycast; a spatial index is a later performance concern, not this slice.

---

## 9. References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`: section 6.5
  (the two views share selection), section 6.9 (selection, gizmos, and hit testing by
  `userData.entityId`), and section 6.13 (accessibility, keyboard navigation, and
  color-blind-safe highlighting).
- Track foundation `docs/specs/2026-06-09-three-dimensional-preview-foundation.md`:
  section 5.1 (mesh-to-entity identity), section 5.3 (shared selection state),
  section 5.7 (the accessibility seam: proxies, roving tab order, announcements, and
  the color-blind-safe highlight), and section 6 (the testing strategy).
- ADR-0066 (this slice's decisions): selection is the shared store, the pick is pure
  engine, the highlight is a reconciled luminance outline rather than a material
  change, and the accessibility surface reuses the plan overlay's shape.
- ADR-0020 (bridge-owned selection outside undo): the shared store both views drive.
- ADR-0061 (the wall shell): the `userData.entityId` the pick reads.
