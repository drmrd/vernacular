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
    bridge/react/use-view-scene-graph.ts,
    bridge/react/use-framed-scene.ts,
    bridge/react/walk-interaction.ts,
    bridge/react/walk-camera-controls.tsx,
    bridge/react/walk-session.ts,
    bridge/react/scene-object-controls.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/live-scene-view.tsx,
    bridge/react/use-opening-motion-floors.test.tsx,
    bridge/react/use-opening-motion-floors-test-support.tsx,
    bridge/react/walk-interaction-settle.test.ts,
    core/scene/opening-reach.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0198: Open doors and windows follow the scene session, and one control closes them in either camera mode

## Status

Current. Landed with issue #533. The owner made the interface choices below on 2026-11-16. This
record extends [[ADR-0170-scene-session-state-in-a-bridge-provider]], which put the open-door ids in
the scene session store, and supersedes nothing. It was amended on 2026-11-18 for issue #777, so
that the doors and windows of every shown floor follow the session.

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
already posed each root, and the tick keeps every opening the view shows posed in both camera
modes, so a walk begins with every shown door in the state the session holds.

One case changed. In whole-building scope, a door that was open on one floor, with another floor
active during a rebuild, was not posed when the user returned to that floor. It showed shut while
the session held it open, and the walker passed through it. `main` behaved the same way at the
time. An earlier version of this change restored the openings when a walk started, and that covered
this one path. The restore was removed because the hook made it redundant for the active floor. The
amendment of 2026-11-18 below closes the case.

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
call. The camera rig logic in `webgpu-scene-view.tsx` is unchanged, but the file changed in four
small ways: one import, one call to `useInteractiveObjects()` in the toolbar component, two props
passed to the toolbar, and the prop name `storedOpenDoorIds` on the walk controls.

## Consequences

- A door opened in walk mode stays open in orbit mode, and it survives a scene rebuild or a
  view-mode switch at the pose the session gives it, on every floor the view shows. A reset in
  orbit mode also reaches the walk collision world, which reads the same interaction state, so
  the next walk treats those doors as shut.
- The R key and the toolbar button reach the same state by two code paths. The R key does not call
  `resetInteractiveObjects`.

Known gaps:

- The gap of openings on floors other than the active one (issue #777) is closed, as the
  amendment of 2026-11-18 below records.
- The stored set can keep the id of a door that no longer exists. After a user deletes a door that
  is open, or undoes its insertion, its id stays in the stored set, so the toolbar control stays
  enabled with nothing to close until one press of the control or of the R key empties the set.
  This was found by reading the code and was not reproduced. Issue #780 tracks this.
- A rebuilt open door can show shut for one frame. The effect that poses a new root is a plain
  effect, which runs after paint, and the tick now runs in orbit mode as well. The live runs looked
  for this flash and did not see it. The first two runs sampled about 10 frames each second, and
  the repeat run sampled a frame about every 8 ms, so a flash shorter than one sampled frame is not
  excluded. The journey under Evidence reads the door's region on each animation frame of the
  page through an edge-overlay rebuild, a paint edit, and a switch to the plan view and back, and
  fails if a frame it reads shows the door shut. It does not show that it reads every frame the
  page draws, so the gap stays open. A layout effect should close the gap, but it changes the
  timing of every rebuild. Issue #778 tracks this.
- The tick does work in orbit mode even when nothing moves. For each opening the view shows at rest
  on its target, each frame does two lookups (its open state and its openness) and a compare. The
  frame cost is not measured.
- The opening tick in the frame callback of `bridge/react/walk-camera-controls.tsx` runs only
  under a real WebGPU canvas, so no unit test reaches it. Unit tests cover `followStoredOpenings`,
  `restoreOpenings`, `settleUnshownOpenings`, `resetInteractiveObjects`, the
  `useInteractiveObjects` hook against a store, the toolbar control, and `useOpeningMotion` itself.
  The hook imports nothing from the canvas library, and `bridge/react/use-opening-motion.test.tsx`
  checks three things: the live openings follow the stored set, a new root is posed at the open
  pose its door carried before any tick, and a new root that arrives in the same render as a new
  stored set is posed from the pose its door carried and from the set that arrived with it, before
  any tick. The journey described under Evidence runs the callback on a live view and sees the
  doors swing in both camera modes. No test asserts the order of the tick after the walk step.
- A disabled control gives its reason only in its `title` attribute. Nothing visible in the toolbar
  says why the button is disabled. Issue #779 tracks this.
  (Updated 2026-11-21: ADR-0227 resolves this for the 3D toolbar. Issue #1023 tracks the tool
  chips.)

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

On 2026-11-17 a committed journey took over these checks:
`e2e/tests/journeys/close-doors-and-windows.spec.ts` (issue #782). It opens a door and a window in
walk mode with the E key. The toolbar control closes the door in orbit mode and in walk mode, and
the window in orbit mode.
It also covers the rebuilds and the view switch above, the walker blocked at a shut door, and the
control agreeing with the R key. It compares frames taken in the same run, in the region of the
opening, and commits no pixel baseline. An in-page sampler reads that region on each animation
frame to catch the door in mid swing. The journey skips where the browser gives no WebGPU adapter.
The macOS job `live-view-visual` runs it with `E2E_REQUIRE_WEBGPU=1`, so there a missing adapter
fails the step (ADR-0171).

Limits:

- The first two runs sampled about 10 frames each second, and the repeat run at commit `be7d25b9`
  sampled a frame about every 8 ms. A flash of a shut door shorter than one sampled frame during a
  rebuild is not excluded.
- The journey checks the start of a walk in three of the five states the scripted run tried: after
  orbit mode with the door open, after a reset made in orbit mode, and on a fresh page. On a fresh
  page the door is out of the walker's sight, so that case checks the control and the orbit view
  instead. The journey never compares walker views by pixels across a scene rebuild, because the
  walker view is shaded differently after a rebuild even when no door was opened (issue #781). It
  does not repeat the check of the toolbar's height.
- No automated test asserts the order of the opening tick after the walk step.
- The cases of the 2026-11-18 amendment, on floors other than the active one, were not run on a
  live view. Unit tests hold them.

## Amendment 2026-11-18: every shown floor

Issue #777. Before this amendment the opening motion hook knew only the active floor's doors and
windows. In the whole-building 3D view, "Close doors and windows" left a door of another floor
open on screen, and a rebuilt scene showed a door that the session held open as shut. In the
floor view, a door that was reset while its floor was not shown was posed open when the user came
back to that floor, and then swung shut.

The hook now keeps two lists in `OpeningMotionRefs`. `openings` holds the active floor's openings,
and the interact key still reads it. Walking and the E key belong to the floor the user stands
on, so a door on another floor stays out of reach. `shownOpenings` holds every opening that the 3D
view shows: the active floor's in the floor view, and every visible floor's in the whole-building
view. The per-frame tick swings the shown list, so a reset reaches every door on screen.

The shown list comes from the same inputs as the graph that the framed scene is built from.
`useShownSceneGraph` in `bridge/react/use-view-scene-graph.ts` scopes the raw graph by the active
floor and the building view, and `useFramedScene` and `useOpeningMotion` both call it, so "the
graph the view shows" has one definition. The two calls run in two React roots, the page and the
3D canvas, so for one commit after a change of the view the list can be newer than the root. The
pose effect runs again when the new root arrives, and an opening that a root does not hold is
skipped, because `applyOpeningMotionForNode` ignores a node with no built group.

The pose effect runs on each new scene root and on each change of the shown list. It first
settles every opening that the new list does not show, which the next paragraph describes. Then it
poses the shown openings from the openness they carry, through `restoreOpenings`. It cannot
disturb a swing in progress. The tick writes each opening's openness as it moves it, so the pose
puts the opening where the tick last left it.

`settleUnshownOpenings` in `bridge/react/walk-interaction.ts` seats each opening that the view
does not show at its target, with no swing. It runs on every change of the stored set, and in the
pose effect on every change of the shown list, so a door that leaves the view part way through its
swing is settled too. A door the session
holds open goes fully open, and any other goes shut. No tick reaches these openings, so without
the settle a return to their floor would pose them at an old openness and then swing them. A shown
opening keeps its openness, so its swing goes on. An opening that carries no openness gets none.
The settle also runs when the stored set holds the same doors as the walk state, because the R key
in a walk resets the state before the store echoes it.

The settle touches only openings that are not shown. Snapping every carried openness to its
target on each new root would be simpler, but a rebuild in the middle of a swing must keep the
swing of a door on screen, and the tests pin that.

The whole-building view can hide the underground floors. A door on a hidden underground floor is
not shown, so it is settled like a door of a floor that is not shown. There is no special case for
it.

Cost: the tick now visits every shown opening each frame. In the whole-building view that is every
door and window of every visible floor, each with two lookups and a compare while at rest. This was
not measured.

Tests that hold the amendment:

- `bridge/react/use-opening-motion-floors.test.tsx`, with its fixtures in
  `bridge/react/use-opening-motion-floors-test-support.tsx`:
  - "swings a door on another shown floor shut once the stored set is emptied", which also checks
    that `openings` holds only the active floor's door;
  - "poses an open door of another shown floor on a newly built root before any tick";
  - "keeps a door part way through its swing when the shown list changes and the root stays";
  - "shows a door reset while its floor was not shown as shut on the return, before any tick";
  - "shows a door still held open as open on the return, before any tick";
  - "shows a door reset in the floor view as shut when the view switches to the whole building";
  - "seats a door that leaves the view part way through its swing at its target, so it shows there
    with no swing when its floor returns".
- `bridge/react/walk-interaction-settle.test.ts`, under `settleUnshownOpenings`:
  - "shuts an unshown opening the session no longer holds open, and leaves a shown one as it is";
  - "opens fully an unshown opening that the session holds open and that carries a shut openness";
  - "seats a part way unshown opening at its target, with no swing left to play";
  - "leaves a shown opening part way through its swing, so the tick still plays it";
  - "gives no openness to an unshown opening that carries none, even one the session holds open".

The three tests in `bridge/react/use-opening-motion.test.tsx` pass unchanged. The close-doors
journey still covers the active floor only; issue #901 tracks a whole-building case for it.

## Amendment 2026-11-21: a second E closes an open door from where it opened it

Issue #817 asked what the E key must do for a door that stands fully open. The owner decided on
20 November 2026:

> in walk mode, a second press of E closes a fully open door from the pose that opened it. This
> matches the hung window, which a second E has closed since #850. The reach test must find a leaf
> that lies along the reach ray. The R key and the toolbar control keep closing openings as they do
> now.

Before this change the reach tested only the leaf at its current openness. A fully open swing door
has its leaf parallel to a head-on ray, so the ray missed it and the second press did nothing.

The rule now is that the shut frame of an opening always counts, at every openness, and the moved
leaf counts as well once the opening is open. `openingUnderReach` takes the nearer of the two hits.
It applies to every opening that moves, whether it swings, slides along the wall, or rises in its
frame. A hung window already kept its shut rectangle, so it behaves as before, and a cased opening
has no leaf to test. The context above still holds: E opens or shuts the door or window in reach.
The R key and the toolbar control are unchanged. The code is in `core/scene/opening-reach.ts`.

## References

- Issue #533, and issue #777 for the amendment.
- ADR-0170, which this record extends, and ADR-0128 for the opening motion itself.
- `bridge/scene-session/interactive-objects.ts`, `bridge/react/use-opening-motion.ts`,
  `bridge/react/use-view-scene-graph.ts`, `bridge/react/walk-interaction.ts`, and
  `bridge/react/scene-object-controls.tsx`.
