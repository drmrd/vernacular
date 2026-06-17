# Furniture in the 3D preview

Status: draft
Issue: #175 (Assets: furniture in the 3D preview)
Depends on: #174 (furniture model, placement tool, asset library), the 3D preview track

## Why

A planner places furniture on the plan today, but the 3D preview shows an empty
shell. You cannot read how a piece sits in a room, whether a chair clears a
doorway swing, or how much floor a sideboard eats until you switch back to the
2D view and reason about it in your head. The 3D preview is where massing and
clearance questions get answered, so the furniture you placed belongs there.

## What this delivers

Every placed furniture item appears in the 3D preview as a solid massing volume:
a box the size of the piece, standing where you put it, turned to its angle, and
raised to its elevation. Selecting a box in 3D selects the same item in the plan
and the Inspector, and selecting in the plan highlights the box, so the two views
stay in step. The camera frames the furniture along with the walls.

This is the first of two phases. It renders the piece as a massing volume, not
its actual model geometry. Loading and drawing the real model is the second
phase, tracked separately (see "Deferred").

### Why massing first

A massing box is honest about what a floor planner needs first: the space a piece
occupies and how it reads against the walls and openings. It is also the safe
foundation. The box is built from numbers already in the model, so the whole 3D
build stays synchronous and deterministic, with no asset loading on the render
path. Every piece this phase adds, the scene-graph node, the box builder, the
reuse tier, and 3D selection, is exactly what the real-model loader reuses later.
The asynchronous, baseline-sensitive work of parsing a model and fitting it
to the box lands in the second phase on top of a proven base.

## The massing volume

A furniture item carries a plan position, a free rotation angle, a footprint
(width and depth), and an elevation above the floor. To stand it up in 3D we also
need its height. The box is then the footprint extruded to that height: width
along the item's local x axis, depth along its local y axis, height up the world
vertical, centered on the plan position, turned by the rotation, and lifted so
its underside sits at the elevation (an elevation of zero rests it on the floor).

The box uses a neutral surface appearance, the same treatment the wall-junction
fill uses: never painted, always a plain solid so the volume reads against the
floor and walls under any lighting. A dark edge line traces its outline, matching
every other surface in the preview.

## Carrying height through the model

The furniture model stores a two-dimensional footprint but no height, and the
library item built from a pack manifest drops the manifest's declared height on
the way to placement. To draw a box we keep that height.

- The furniture instance gains a `height` in millimeters, a sibling of the
  footprint and elevation. It is the vertical extent of the massing box and, in
  the second phase, the target a real model is scaled to fit.
- A library item carries the declared height from its source so a placed item can
  default to it. A pack asset declares width, depth, and height in its manifest;
  this phase keeps the height that the library projection currently discards.
- Placing an item copies the library item's height onto the new instance. An
  imported model has no parsed geometry yet (parsing is the second phase), so an
  import defaults to a sensible standing height, the same editable-default bridge
  the footprint already uses for imports.
- The Inspector gains a height field beside width and depth, so a planner can
  correct the box for any piece. Editing it is one undoable step, like the
  existing footprint and rotation edits.

This is an additive change to the document model, so it advances the schema by one
version with a migration that adds a default height to any furniture instance that
predates the field. No released project carries furniture yet, so the migration is
a formality, but the format guard requires it.

## How it threads through the 3D pipeline

The preview already projects the project into a pure scene graph, builds a group
tree from that graph through a material seam, reuses the parts of a floor that did
not change between edits, and frames a camera on the result. Furniture follows the
same path the openings follow.

- **Scene graph.** A furniture scene node joins the graph: a stable namespaced id,
  the owning floor, and the box's position, rotation, footprint, height, and
  elevation. A derivation builds one node per furniture item on a floor, and the
  whole-project derivation includes them. The derivation is pure and reads only
  the model, with no asset loading.
- **Builder.** A furniture builder turns one node into a box group, tagged with the
  item's entity id for picking, flagged as a shadow caster, and traced with the
  edge line. It is the furniture counterpart of the opening-fill builder.
- **Reuse.** The live preview reconciler holds furniture as a per-item sub-group
  and reuses the box whose derived node is unchanged by reference, the same reuse
  tier the openings use, so editing one piece does not rebuild the others. The
  deterministic build path used by the test harness builds furniture too.
- **Selection.** A box is pickable by the existing ray pick, which reads the
  entity id off the struck object, so furniture joins the shared selection state.
  A selected box draws the standard selection outline. Selecting a piece in either
  view selects it in both, because both views read one selection.
- **Camera.** Framing already fits the world bounds of the built scene, and the
  boxes are part of those bounds, so the camera includes furniture with no change.

## Testing

- Unit tests for the furniture derivation (one node per item, correct fields,
  namespaced id), the box builder (box dimensions, world placement, rotation,
  elevation, entity-id tag, edge line), and the reconciler reuse tier (an
  unchanged piece keeps its box, a changed piece rebuilds).
- Unit tests for the model change: the height field and its default at placement,
  the schema migration, and the Inspector height edit.
- An end-to-end scene fixture that renders a placed piece as a box, following the
  existing scene-image baseline convention for the 3D preview.
- The 2D editor is untouched, so its tests stay as they are.

## Deferred

- **Rendering the real model geometry (the second phase, #175b).** A loader reads
  the asset bytes from the content cache, parses the model, normalizes its origin
  and scale to the item's box, and swaps the box for the model. This is the
  asynchronous, baseline-sensitive half of the issue and gets its own spec, plan,
  and decision record. It is tracked as a follow-up issue linked to #175.
- **Origin and scale normalization of imported models.** This needs the parsed
  geometry the second phase introduces, so it travels with it. The editable height
  and footprint defaults bridge until then.
- **Per-piece appearance in 3D.** The massing volume is a single neutral solid.
  Material, color, and texture for furniture are out of scope here.

## Decision records

- A new record covers the furniture massing volume and the height the model now
  carries: the box derivation, the neutral surface, the new model field and its
  migration, and the choice to render massing before real geometry.
- It cross-links the asset and furniture records (the furniture model, the in-app
  asset library, and the assets-and-furniture track decision) and notes the second
  phase as the planned follow-up.
