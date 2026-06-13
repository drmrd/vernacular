# Select-mode hover preview

Status: accepted
Issue: #117
Related ADR: ADR-0071

## Why

In Select mode the plan gives no sign of what a click will pick. The hit test
already decides this: it walks openings, then walls, then dimensions, then the
room under the point, and returns the one entity a click would select. That
decision is invisible until the click lands, so a user aiming at a wall near a
room edge cannot tell which one they are about to grab.

This slice surfaces that decision while the pointer is at rest. The entity the
hit test would return lights up under the cursor, so the pick is previewed before
the click commits it.

## What changes

### The hovered entity is highlighted at rest

While the Select tool is active and no button is pressed, the entity under the
cursor (the hit-test result, in the existing opening over wall over dimension
over room order) draws with a hover highlight. Move the pointer and the highlight
follows the pick. Move onto empty space and it clears.

The highlight is a lighter cue than the selection style, so a hovered entity and
a selected entity never read the same. When the hovered entity is already
selected, no hover highlight draws: the selection style already marks it, and a
second cue on top would only add noise. The hover preview therefore answers one
question, "what new thing will this click select."

### Hover is a resting-pointer affordance only

The highlight updates only when no button is down. The moment a drag begins (a
pan, a Shift-drag marquee, or a move of the selection), the hover clears and does
not return until the button releases and the pointer moves again. A drag already
has its own feedback, and a hover trailing the cursor through a pan would fight
it. Leaving the canvas clears the hover as well.

### The cursor is unchanged

Select mode keeps the open-hand cursor at rest. The hover highlight, not the
cursor, carries what-is-under-you here. Making the resting cursor itself change
shape over a pickable entity is a later refinement; the open hand stays a uniform
invitation to drag.

## Boundaries

- No new command and no model change. The hovered entity is transient view state,
  never stored and never undoable, the same standing as the selection set and the
  viewport.
- The pick is the existing `hitTest`; this slice does not add a second hit-test
  path. It only wraps the result to drop a hover that lands on an
  already-selected entity.
- The accessibility overlay is untouched. Hover is a pointer-only affordance, and
  a keyboard user already sees the selection highlight on the entity they act on,
  so there is no hover analog to add to the proxy layer.
- Tooltips, measurements, or any text readout on hover are out of scope. This is
  the highlight only; cursor-adjacent readouts arrive with the live-drag slice
  (#118).

## How it is verified

- A pure test for the hover-target resolver: it returns the hit-test pick, returns
  nothing over empty space, and returns nothing when the pick is already selected.
- Renderer tests that a hovered wall, room, opening, and dimension each draw with
  a hover style distinct from both their default and their selected styles.
- An end-to-end test that moves the pointer over an entity in Select mode and
  asserts the hover highlight appears, then moves to empty space and asserts it
  clears, without changing the selection.
