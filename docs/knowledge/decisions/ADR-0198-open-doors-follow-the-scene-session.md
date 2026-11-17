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
   ref. Worse, the next E or R press wrote the stale ref back to the store and undid the reset.
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
pose. This fixes the rebuild defect described above.

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
Context it changed nothing on screen, and the next E or R press would have undone it.

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
call; the rig in `webgpu-scene-view.tsx` is unchanged.

## Consequences

- A door opened in walk mode stays open in orbit mode, and it survives a scene rebuild or a
  view-mode switch at the pose the session gives it. A reset in orbit mode also reaches the walk
  collision world, which reads the same interaction state, so the next walk treats those doors as
  shut.
- The R key and the toolbar button reach the same state by two code paths. The R key does not call
  `resetInteractiveObjects`.

Known gaps:

- Only the active floor's openings follow a reset in the whole-building view. The follow, the
  restore, and the tick all read `useActiveFloorOpenings` in `use-opening-motion.ts`. A door left
  open on another floor stays open after a reset until that floor becomes active, and a rebuild can
  show it shut while the store holds it open. A follow-up issue tracks this.
- A rebuilt open door can show shut for one frame. The effect that poses a new root is a plain
  effect, which runs after paint, and the tick now runs in orbit mode as well. The live run looked
  for this flash and did not see it, but it sampled only about 10 frames each second, so a flash
  shorter than about 100 ms is not excluded. A layout effect should close the gap, but it changes
  the timing of every rebuild. A follow-up issue tracks this.
- The tick costs something in orbit mode even when nothing moves. For each opening on the active
  floor at rest on its target, each frame does two lookups (its open state and its openness) and a
  compare. The frame cost is not measured. A follow-up issue tracks this.
- The React wiring between the store and the frame loop has no unit test. Unit tests cover
  `followStoredOpenings`, `restoreOpenings`, `resetInteractiveObjects`, the `useInteractiveObjects`
  hook against a store, and the toolbar control. Nothing tests `useOpeningMotion` or the frame
  callback in `WalkCameraControls`, because that code runs only under a real WebGPU canvas. The
  live run described under Evidence was a script, not a committed test, so no automated test
  covers this wiring yet. A follow-up issue tracks this.
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
- The toolbar keeps its height of 140 px at 1280 x 720, so the canvas size and the pixel baselines
  are unchanged.

Limits:

- The run sampled about 10 frames each second. A flash of a shut door shorter than about 100 ms
  during a rebuild is not excluded.
- This was a scripted run, not a committed test. No automated test covers the wiring between the
  session store and the frame loop yet.
- The whole-building case in Known gaps was not run.

## References

- Issue #533.
- ADR-0170, which this record extends, and ADR-0128 for the opening motion itself.
- `bridge/scene-session/interactive-objects.ts`, `bridge/react/use-opening-motion.ts`,
  `bridge/react/walk-interaction.ts`, and `bridge/react/scene-object-controls.tsx`.
