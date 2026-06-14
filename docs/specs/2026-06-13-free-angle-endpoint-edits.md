# Free-angle modifier for wall endpoint edits

Status: accepted
Issue: #120
Related ADR: ADR-0074

## Why

Drawing a wall already has an escape hatch from the angle lock. As the cursor
moves, the run squares itself to the nearest right or forty-five degree ray so a
wall lands straight without fuss, and holding Alt (Option on a Mac) suspends that
lock so the wall can take any angle the user wants. The modifier is how a power
user draws the one off-square wall in an otherwise orthogonal plan.

Editing an existing wall does not offer the same escape. Select a wall, grab an
endpoint, and drag it: the same angle lock squares the reshaped wall, but there
is no way to suspend it. To nudge an endpoint to a free angle the user has to
fight the lock or fall back to typing coordinates, which is exactly the detour the
drawing modifier was built to avoid. The two gestures reshape the same geometry
and should behave the same way.

This slice carries the drawing modifier to endpoint editing. Holding Alt while
dragging an endpoint suspends the angle lock, so the endpoint follows the cursor
to whatever angle it lands on. Release Alt and the lock returns. It is the same
key as drawing, and holding or releasing it does the same thing.

## What changes

### Holding the modifier frees a dragged endpoint from the angle lock

When a wall is selected under the Select tool and the user drags one of its
endpoints, holding Alt suspends the angle lock for the duration of the drag. The
dragged endpoint follows the cursor to a free angle instead of squaring to the
nearest right or forty-five degree ray. Releasing Alt restores the lock, and the
endpoint squares again on the next movement. It is the wall tool's modifier on its
own key, doing for an existing wall what it already does for a freshly drawn one.

### The modifier suspends only the angle lock

Holding Alt suspends the angle lock and nothing else. Grid snapping, snapping to
another wall's endpoint, and the other snaps stay active, exactly as they do when
the modifier frees a drawn wall. The modifier changes which angles the endpoint
can take; it does not turn off snapping altogether.

### The live preview tracks the modifier without a pointer move

While an endpoint drag is in progress, pressing or releasing Alt updates the live
preview and its readout immediately, without waiting for the next pointer move. A
user who has dragged an endpoint to roughly the right spot can press Alt to see
the wall settle onto the free angle in place, then release it to watch it square
back. This matches the drawing modifier, where the rubber-band preview re-resolves
the moment the key toggles.

## Boundaries

- No model or command change. The endpoint move still dispatches the existing
  `moveWallEndpoint` command with the resolved point and lands as one undoable
  step. The modifier only changes which point the drag resolves to; nothing new is
  stored.
- The modifier reuses the existing free-angle plumbing. The angle lock already
  reads a free-angle flag in the shared snap resolver, and the wall tool already
  tracks Alt while it is active. This slice tracks the same key while an endpoint
  drag is possible and threads the same flag into the endpoint drag's snapping. No
  second key, no second flag, and no new snap behavior are introduced.
- Endpoint editing keeps its current feedback. It shows the length-and-bearing
  readout pill introduced for live drag edits (#118); it does not gain the wall
  tool's spoken "Locked to N degrees" announcement. Announcing the angle lock to
  assistive technology during an endpoint edit is a separate accessibility
  improvement and is out of this slice.
- Drawing is untouched. The wall tool's modifier, its ghost re-resolve, and its
  announcement keep working as they do today. The shared key tracker the two
  gestures use is one implementation, so they cannot drift apart.

## How it is verified

- An end-to-end test that draws a wall, selects it, and drags an endpoint toward
  an off-square angle twice: once plainly, where the readout reports the squared
  bearing, and once with Alt held, where the readout reports the free bearing.
  The two bearings differ, which shows the modifier suspends the lock during the
  drag.
- An end-to-end test that drags an endpoint toward an off-square angle without the
  modifier, so the readout reports the squared bearing, then presses Alt without
  moving the pointer and asserts the readout changes to the free bearing. This
  shows the preview re-resolves on the toggle alone.
- The full check chain and the chromium and scene-webgl end-to-end suites stay
  green, and the home visual baseline is unchanged, since the modifier only acts
  during a pointer drag.
