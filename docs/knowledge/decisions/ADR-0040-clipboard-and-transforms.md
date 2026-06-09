---
slug: decisions/ADR-0040-clipboard-and-transforms
title: 'ADR-0040: Clipboard and transforms over selected plan entities'
type: decision
tags:
  [
    architecture,
    core,
    bridge,
    editor,
    plan,
    selection,
    transforms,
    move,
    rotate,
    delete,
    clipboard,
    copy-paste,
    commands,
    undo-redo,
  ]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0037-image-underlay-and-calibration,
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0039-dimensions-and-thickness-aware-area,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-08-clipboard-and-transforms.md,
    core/geometry/point.ts,
    core/commands/handlers/transform-commands.ts,
    core/clipboard/clipboard.ts,
    bridge/clipboard/clipboard-store.ts,
  ]
status: current
updated: 2026-06-08
---

# ADR-0040: Clipboard and transforms over selected plan entities

## Status

Accepted; implemented (slice 10 of the Phase 1 two-dimensional plan editor) on
branch `feat/clipboard-and-transforms`, stacked on slice 9. The slice design is
`docs/specs/2026-06-08-clipboard-and-transforms.md`; the parent design
specification remains authoritative. This ADR records how the editor turns
selection into editing: how the selected entities are moved, rotated, and
deleted, and how copy and paste are modeled.

## Context

Slice 5 built selection and the hit-test, and slices 6 through 9 added editing of
one entity at a time through inspectors and handles. The Phase-1 deliverable list
names "copy/paste/delete/move/rotate", the editing operations that act on the
selection as a group and make the editor usable, and they were the last
two-dimensional-editor slice outstanding. The plan stores three kinds of directly
selectable entity per floor (walls, openings, dimensions); openings are
parametric on a host wall (an along-wall `position`), and rooms are a derived
projection of the wall graph (ADR-0026), not stored. The mutation framework
captures inverses automatically when a handler reassigns `state.floors`
(ADR-0005), and selection is bridge-owned and held outside undo (ADR-0020).

## Decision

### Transforms act on stored entities; openings and rooms follow

Move, rotate, and delete operate on the floor's stored entities by id.
`core/geometry/point.ts` gains pure `translatePoint(point, delta)` and
`rotatePoint(point, pivot, radians)`. Three undoable commands in
`core/commands/handlers/transform-commands.ts` (`translateEntities`,
`rotateEntities`, `deleteEntities`) take a `floorId` and a `string[]` of selected
ids. Translate and rotate map the endpoints of selected walls and dimensions
through a shared `transformFloorEntities(floor, ids, move)` helper; openings carry
no world geometry of their own (only an along-wall `position`), so they ride a
transformed host wall with no explicit handling, and rooms re-derive from the
moved walls for free (ADR-0026). Delete drops selected walls together with the
openings those walls host (a cascade, since an opening cannot outlive its wall),
plus selected openings and dimensions, in one inverse-captured step. The rotation
pivot is a command parameter (a pure `selectionCenter` supplies the selection
bounding-box center), keeping the command general for the deferred free-rotate
handle. Ids are passed as `string[]`, not a `Set`, because command params persist
with autosave and must be plain serializable data.

### Clipboard is a pure, serializable snapshot with two backings

`core/clipboard/` holds the framework-free clipboard core: a `ClipboardSnapshot`
(walls, openings, dimensions), `buildClipboardSnapshot` (the selected walls, the
openings those walls host, and the selected dimensions; an opening whose wall is
not selected is dropped because it has no home to paste onto),
`serializeClipboard` / `deserializeClipboard` (a tagged, versioned JSON payload
that rejects foreign or malformed text), and `instantiateClipboard` (fresh ids, an
old-to-new wall id remap so pasted openings re-host onto their pasted walls,
offset geometry, and the flat list of new ids for selecting the paste). A
`pasteEntities` command appends the instantiated entities, built eagerly so redo
reuses their ids (like `addWall`). The clipboard has two backings: an in-app
store in the bridge held outside undo (the primary, mirroring the selection store,
ADR-0020), and an additive operating-system-clipboard adapter over the same
serializer. Copy writes both; paste prefers a valid operating-system payload and
falls back to the in-app store, so paste works within a session without clipboard
permission and across tabs or reloads with it. No persisted project field changes,
so there is no schema migration; the serialized payload carries its own format tag
and version, independent of the project schema.

### Editor routes a move-drag beneath the existing handle drags

On the `select` tool, a pointer press on a selected entity's body begins a
move-drag that previews a translated ghost and commits `translateEntities` on
release; a press on a slice-6 endpoint handle or a slice-7 opening keeps its
existing drag, and a press on empty space remains the slice-5 marquee. Arrow keys
nudge, Delete and Backspace delete, and the platform copy, cut, and paste
keystrokes drive the clipboard. Rotation is exposed this slice as ninety-degree
controls and a numeric angle entry in a selection transform panel; the free-angle
drag handle with modifier-key angle snapping is the committed near-term follow-up,
already supported by the command's arbitrary-angle and explicit-pivot signature.

## Consequences

- Selection becomes editing: the user moves, rotates, deletes, and duplicates
  groups of entities, all undoable through the existing framework.
- Openings and rooms need no transform code of their own; the parametric and
  derived models pay off, and `instantiateClipboard`'s host-wall remap is the only
  reference-fixup the clipboard needs.
- The clipboard core is pure and serializable, so the in-app and
  operating-system backings share one implementation and the
  free-rotate-handle follow-up is an editor-only addition.
- The move-drag adds a fourth pointer-priority tier on the `select` tool (handle,
  opening, selected-body move, marquee); the routing is the main integration
  surface and is covered by the move-drag state-machine tests and the end-to-end
  flow.

## Alternatives considered

- **One affine `transformEntities` command instead of explicit translate and
  rotate.** Rejected for this slice: explicit small commands match the codebase
  grain (`addWall`, `moveWallEndpoint`, `setWallThickness`), give clear undo
  descriptions, and still share the `transformFloorEntities` helper, so there is
  no duplication to collapse.
- **Transforming openings by recomputing their world position.** Rejected as
  unnecessary: an opening is parametric on its wall, so moving the wall moves the
  opening; recomputing a position would fight the model and risk drift.
- **The operating-system clipboard as the only backing.** Rejected as the primary:
  it is async, permission-gated, and browser-variable, so paste could silently
  fail within a session. The in-app store is the deterministic primary; the
  operating-system layer is additive and shares the serializer.
- **Paste at the pointer.** Deferred: a fixed offset ships duplication simply and
  visibly; threading a paste location through the keyboard glue is later polish.
- **Free-angle rotate by a drag handle now.** Deferred to the committed near-term
  follow-up: the command already accepts an arbitrary angle and pivot, so only the
  editor gizmo and its hit-test remain, and the ninety-degree controls cover the
  common case without the extra interaction surface this slice.

## References

- Slice design: `docs/specs/2026-06-08-clipboard-and-transforms.md`.
- Design specification sections 3.1, 6.1, 512, and the section 10 Phase 1
  "Copy/paste/delete/move/rotate" deliverable.
- ADR-0005 (framework-captured inverse), ADR-0020 (bridge-owned selection outside
  undo, which the clipboard store joins), ADR-0026 (geometric room derivation),
  ADR-0032 (the hit-test the move-drag routes beneath), ADR-0037, ADR-0038, and
  ADR-0039 (the additive-per-floor-entity command pattern these commands follow).
