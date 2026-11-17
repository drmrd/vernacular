---
slug: decisions/ADR-0198-open-doors-follow-the-scene-session
title: 'ADR-0198: Open doors and windows follow the scene session, and one control closes them in either camera mode'
type: decision
tags: [bridge, three-dimensional, session-state, walk, openings, toolbar]
related:
  [
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
    decisions/ADR-0128-opening-animation-motion-model,
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0135-walk-collision-swept-movement-and-thickness-standoff,
  ]
sourceFiles:
  [
    bridge/scene-session/interactive-objects.ts,
    bridge/scene-session/scene-session-store.ts,
    bridge/react/use-interactive-objects.ts,
    bridge/react/use-opening-motion.ts,
    bridge/react/walk-interaction.ts,
    bridge/react/walk-camera-controls.tsx,
    bridge/react/walk-session.ts,
    bridge/react/scene-object-controls.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/webgpu-scene-view.tsx,
  ]
status: current
updated: 2026-11-16
---

# ADR-0198: Open doors and windows follow the scene session, and one control closes them in either camera mode

## Status

Current. Landed with issue #533. The owner made the interface choices below on 2026-11-16. This
record extends [[ADR-0170-scene-session-state-in-a-bridge-provider]], which put the open-door ids in
the scene session store, and supersedes nothing.

## Context

In walk mode the E key opens or shuts the door or window in reach, and the R key shuts every one
that stands open (`bridge/react/walk-session.ts`). Each press writes the walker's open set to
`openDoorIds` in the scene session store (`bridge/scene-session/scene-session-store.ts`). Issue #533
asks for a way to put the doors back from orbit mode as well.

Clearing `openDoorIds` in the store did nothing to the live scene. There were three reasons.

1. The walk controller read the stored set once, as the starting value of a ref in
   `bridge/react/walk-camera-controls.tsx`. A later write from anywhere else never reached that
   ref. Worse, the next E press wrote the stale ref back to the store and undid the reset.
2. The per-frame opening tick (`tickOpenings` in `bridge/react/walk-interaction.ts`) ran inside the
   walk step, and the frame callback returned early outside walk mode. In orbit mode each opening
   kept the last pose the tick gave it, because the engine helper moves the fill group itself. A
   door that was part way through its swing at the mode switch stayed part way open.
3. The toolbar renders outside the React Three Fiber canvas (`bridge/react/webgpu-scene-view.tsx`).
   The code that moves an opening needs the live scene root and a frame callback, which exist only
   inside the canvas. A button on the toolbar can reach the openings only through the store.

A defect also existed before this change. A reconcile that changes anything in the scene builds a
new root (`assembleFloorRoot` in `engine/scene/floor-subgroups.ts`). An opening whose
node changed is built fresh, and so is every opening on a floor after a paint edit, or after the
edge overlay is toggled (that creates a new reconciler in `bridge/react/use-framed-scene.ts`). A
fresh opening sits at its built pose, which is shut. Nothing posed the new root: `restoreOpenings`
ran only when a walk started, it skipped any opening that already had an openness, and the tick
skipped openings at rest on their target. So after a rebuild a door the session held open showed
shut in both camera modes, while the walk collision world still let the walker through it. A
view-mode switch had the same effect on remount: the stored-open doors showed shut in orbit mode
until the next walk began.

## Decision

The scene session store's `openDoorIds` is the one source of truth for which openings stand open.
The live view follows it in both camera modes.

`useOpeningMotion` in `bridge/react/use-opening-motion.ts` holds the opening refs and runs an effect
whenever the stored set changes. The effect calls `followStoredOpenings`
(`bridge/react/walk-interaction.ts`). That function returns the current interaction state unchanged
when it already holds exactly the stored doors, and otherwise returns a new state with a copy of
the stored set. An echo of the walker's own key press is therefore a no-op. The press writes the
ref's own set to the store, and the store keeps that set object as it is. If the press changed
nothing, the store sees the same object and skips the write, since it compares fields with
`Object.is`. Either way the follow finds the same members and keeps the same state. The follow
never writes to the store, so a reset is not reported back.

Each newly built scene root is posed from the session. An effect keyed on the root calls
`restoreOpenings`. An opening that carries an openness is posed at that openness. An opening the
session holds open, with no openness yet, is seated fully open. Every other opening keeps its built
pose. This fixes the rebuild defect described above. Starting a walk restores nothing. The hook has
already posed each root, and the tick keeps the active floor's openings posed in both camera modes,
so a walk begins with every door on the active floor in the state the session holds.

One case changed. In whole-building scope, a door that is open on one floor, with another floor
active during a rebuild, is not posed when the user returns to that floor. It shows shut while the
session holds it open, and the walker passes through it. `main` behaves the same way. An earlier
version of this change restored the openings when a walk started, and that covered this one path.
The restore was removed because the hook made it redundant for the active floor. The case belongs to
the floor-scope gap under Known gaps.

The per-frame opening tick runs in orbit mode too. The frame callback in
`bridge/react/walk-camera-controls.tsx` runs the walk step only in walk mode, then calls
`tickOpeningMotion` in either mode, so after a reset the doors swing shut with the motion the R key
uses.

The reset is one named function over every interactive object. `resetInteractiveObjects(store)`
and `interactiveObjectsAtDefault(session)` in `bridge/scene-session/interactive-objects.ts` own the
meaning of "back to its default". Today the only interactive objects are the opened doors and
windows, so the reset replaces `openDoorIds` with a new empty set, and it leaves the store
untouched when nothing is open. A later interactive object, such as a light, would add its session
field to both functions and its own follower inside the canvas. There is no registry. The reset is
view state: it does not go through `dispatch(command)` and does not enter undo, which matches how
ADR-0170 treats session state.

`useInteractiveObjects` (`bridge/react/use-interactive-objects.ts`) reads the store and binds the
reset for the toolbar. `SceneObjectControls` (`bridge/react/scene-object-controls.tsx`) renders the
button, and `SceneNavToolbar` (`bridge/react/scene-nav-toolbar.tsx`) places it. The R key keeps its
own path in `walk-session.ts` and ends in the same state, an empty stored set.

The owner chose the following on 2026-11-16.

- The label is "Close doors and windows". It names what the control does today. The label is to
  change when a second kind of interactive object lands.
- The button sits in its own secondary group, named "Scene objects", after the camera presets and
  before the display options. It resets objects, not the camera, so it stays out of the primary
  navigation group beside "Reset view".
- The button is disabled while nothing is open. Its title then reads "Nothing to close. Open a door
  or window in walk mode with the E key."
- It is enabled in walk mode as well as orbit mode, because it does not steer the camera. Its
  title there reads "Shuts every door and window that stands open. In walk mode, the R key does the
  same."
- In orbit mode the doors swing shut over time. The owner preferred that to an instant snap.

## Alternatives considered

A reset of the store alone, with no change to the live view. Rejected: for the three reasons in
Context it changed nothing on screen, and the next E press would have undone it.

An instant snap to shut in orbit mode, with no orbit tick. This was the smaller change and cost
nothing per frame. Rejected because the same action would then have two different motions
depending on the camera mode, and the owner chose the animated close.

A registry of reset callbacks that each kind of interactive object registers with. Rejected for
now: there is one kind of interactive object today, and a registry would be a framework with a
single member. The two named functions give a later kind one place to add itself.

A separate scene component for the openings, mounted beside the walk controls in the camera rig.
That would have made ownership clearer. Rejected because it would have changed the shared view file more,
and it would have had to pass the opening refs into the walk controls, which still need them for the E key and for
collision. The opening motion moved into its own hook, `useOpeningMotion`, which the walk controls
call. The camera rig logic in `webgpu-scene-view.tsx` is unchanged, but the file changed in three
small ways: one import, two props passed to the toolbar, and the prop name `storedOpenDoorIds` on
the walk controls.

## Consequences

- A door opened in walk mode stays open in orbit mode, and it survives a scene rebuild or a
  view-mode switch at the pose the session gives it, on the active floor. A reset in orbit mode also reaches the walk
  collision world, which reads the same interaction state, so the next walk treats those doors as
  shut.
- The R key and the toolbar button reach the same state by two code paths. The R key does not call
  `resetInteractiveObjects`.

Known gaps:

- Only the active floor's openings are posed or swung in the whole-building view. The follow
  replaces the open set for every floor, because it works on door ids and reads no openings. The
  restore of a new root and the per-frame tick read `useActiveFloorOpenings` in
  `use-opening-motion.ts`. A door left open on another floor stays open after a reset until that
  floor becomes active, and a rebuild can show it shut while the store holds it open. By reading the
  code, a door that is open on one floor and reset while another floor is active is posed open and
  then swings shut when the user returns to that floor. This was not run. A door that is open on
  one floor, with another floor active during a rebuild, is not posed when the user returns to that
  floor: it shows shut while the session holds it open, and the walker passes through it. This
  case was found by reading the code and was not run. A follow-up issue tracks this.
- The stored set can keep the id of a door that no longer exists. After a user deletes a door that
  is open, or undoes its insertion, its id stays in the stored set, so the toolbar control stays
  enabled with nothing to close until one press of the control or of the R key empties the set.
  This was found by reading the code and was not reproduced. A follow-up issue tracks this.
- A rebuilt open door can show shut for one frame. The effect that poses a new root is a plain
  effect, which runs after paint, and the tick now runs in orbit mode as well. The live runs looked
  for this flash and did not see it. The first two runs sampled about 10 frames each second, and
  the repeat run sampled a frame about every 8 ms, so a flash shorter than one sampled frame is not
  excluded. A layout effect should close the gap, but it changes the timing of every rebuild. A
  follow-up issue tracks this.
- The tick does work in orbit mode even when nothing moves. For each opening on the active floor at
  rest on its target, each frame does two lookups (its open state and its openness) and a compare.
  The frame cost is not measured.
- The frame callback in `bridge/react/walk-camera-controls.tsx` has no automated test. It calls the
  walk step and then the opening tick, and it runs only under a real WebGPU canvas. Unit tests
  cover `followStoredOpenings`, `restoreOpenings`, `resetInteractiveObjects`, the
  `useInteractiveObjects` hook against a store, the toolbar control, and `useOpeningMotion` itself.
  The hook imports nothing from the canvas library, and `bridge/react/use-opening-motion.test.tsx`
  checks three things: the live openings follow the stored set, a new root is posed at the open
  pose its door carried before any tick, and a new root that arrives in the same render as a new
  stored set is posed from the pose its door carried and from the set that arrived with it, before
  any tick. The live run described under Evidence covers the frame callback. It was a script, not a
  committed test.
- A disabled control gives its reason only in its `title` attribute. Nothing visible in the toolbar
  says why the button is disabled. A follow-up issue tracks this.

## Evidence

On 2026-11-16 the feature ran on a live WebGPU view on the development Mac. The extended run used
commit `1f5f1f7c`. A scripted browser compared screenshots of the canvas at 1280 x 720. Two frames of
the never-opened scene were identical, so equal frames differed by exactly zero.

- The control is disabled with the "Nothing to close" title while nothing is open, and enabled with
  the "Shuts every door and window" title once a door opens.
- A press in orbit mode animates the door shut. Frames were captured in mid swing, and the last
  frame is identical to the frame from before the door was ever opened.
- A press in walk mode also animates and ends shut. The reset is not written back: walking on after
  it shows the shut door, the door blocks the walker, and the E key opens it again.
- A door that the session holds open stays open across an edge-overlay rebuild, a paint edit, and a
  switch to the plan view and back. On the previous main commit the edge-overlay round trip returned
  the door to shut.
- A window closes by the same control, and a window and a door that stand open at one time close
  together in the same frames.
- The toolbar keeps its height of 140 px at 1280 x 720. The live-view pixel test
  (`e2e/tests/scene-live-view-visual-regression.spec.ts`, in the `scene-webgl` project) passed on
  the development Mac at commit `be7d25b9` on 2026-11-16, and the toolbar's height and the canvas
  size are the same as on `main`.

The scripted run was repeated at commit `be7d25b9`, after the call that restored the openings when a
walk starts was removed as redundant. It made the same checks as before and five more on the
walk-start path: a walk after orbit on the same scene, after a rebuild, after a reset, on a fresh
page, and after a switch to the plan view and back. In each the door was in the expected state from
the first frame of the walk.

Limits:

- The first two runs sampled about 10 frames each second, and the repeat run at commit `be7d25b9`
  sampled a frame about every 8 ms. A flash of a shut door shorter than one sampled frame during a
  rebuild is not excluded.
- This was a scripted run, not a committed test. No automated test covers the frame callback that
  calls the walk step and the opening tick.
- The whole-building case in Known gaps was not run.

## References

- Issue #533.
- ADR-0170, which this record extends, and ADR-0128 for the opening motion itself.
- `bridge/scene-session/interactive-objects.ts`, `bridge/react/use-opening-motion.ts`,
  `bridge/react/walk-interaction.ts`, and `bridge/react/scene-object-controls.tsx`.
