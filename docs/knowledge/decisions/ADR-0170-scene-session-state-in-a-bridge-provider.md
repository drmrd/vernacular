---
slug: decisions/ADR-0170-scene-session-state-in-a-bridge-provider
title: 'ADR-0170: Scene session state moves into a bridge-owned provider'
type: decision
tags: [architecture, bridge, editor, three-dimensional, session-state, camera]
related:
  [
    decisions/ADR-0146-environment-panel-and-session-contract,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0075-three-dimensional-preview-camera-fit,
    decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy,
    decisions/ADR-0135-walk-collision-swept-movement-and-thickness-standoff,
  ]
sourceFiles:
  [
    bridge/index.ts,
    bridge/scene-session/scene-session-store.ts,
    bridge/react/scene-session-context.ts,
    bridge/react/scene-session-provider.tsx,
    bridge/react/use-scene-navigation.ts,
    bridge/react/use-building-view-state.ts,
    bridge/react/use-framed-scene.ts,
    bridge/react/use-scene-environment.ts,
    bridge/react/scene-camera-seed.ts,
    bridge/react/orbit-camera-controls.tsx,
    bridge/react/walk-session.ts,
    bridge/react/walk-camera-controls.tsx,
    bridge/react/walk-interaction.ts,
    bridge/react/webgpu-scene-view.tsx,
    editor/shell/editor-shell.tsx,
    editor/shell/shell-providers.tsx,
  ]
status: current
updated: 2026-08-31
---

# ADR-0170: Scene session state moves into a bridge-owned provider

## Status

Accepted, landed with issue #603. This record covers the store, the context and provider that
expose it, and the seeding contract each preview hook follows: the navigation state, the
building scope and underground visibility, the edge overlay, the view color temperature, the
saved camera position, and the walk controller's pose and open doors all read and write the
same store, one hook per cycle of the same branch. It extends
[[ADR-0146-environment-panel-and-session-contract]], which put the sibling `EnvironmentState`
contract in the same shape and, at the time, kept view color temperature out of it on the
reasoning that the field "remains view-local." This record moves that field into session state
after all, for the reason explained below.

## Context

Switching the editor's view mode unmounts the 3D preview subtree: `ViewModeViewport` renders the
preview only while the mode is `preview` or `split`, and renders nothing for it while the mode is
`plan`. Every piece of state that lived inside that subtree as component-local `useState` or a
ref was discarded on unmount and re-created from scratch on the next mount. Reported as issue
#603, this showed up as the camera mode, the selection and reveal-interior toggles, the pose an
applied camera preset landed on, the view's color temperature, the building scope and underground
visibility, the edge overlay, and any doors opened during a walkthrough all resetting to their
defaults every time a viewer glanced at the plan and came back. The live camera itself reframed to
the whole model on return, because `userControlled` (the flag that stops `FrameCamera` from
refitting) also lived in that same discarded state and always came back `false`.

None of this state belongs in the building model or the undo history. It answers "where is the
camera and what is the viewer currently looking at," the same category ADR-0020 already drew a
line around for 2D selection, and ADR-0146 drew again for the Environment panel's session
contract. What #603 exposed is narrower: the existing bridge-owned stores for selection and
environment both happen to be mounted above the preview subtree already, so they already survive
a view-mode switch. The state named above had never been given a home above that subtree, so it
never survived the switch.

## Decision

The state listed above moves out of the preview subtree's local `useState` and refs into a new
bridge-owned store, `createSceneSessionStore()` in `bridge/scene-session/scene-session-store.ts`.
The store follows the same shape as `createEnvironmentSessionStore()`: a factory closing over a
mutable snapshot and a listener set, exposing `getSceneSession()`, `updateSceneSession(patch)` as
a partial-patch merge rather than a whole-value replace, and `subscribe(listener)`, with no
dependency on React, the dispatcher, or the undo history. `bridge/react/scene-session-context.ts`
and `bridge/react/scene-session-provider.tsx` expose it to components: `SceneSessionProvider`
wraps a store in context, `useSceneSession()` reads a live snapshot through
`useSyncExternalStore` and returns it alongside the patch function, and both are re-exported
additively from `bridge/index.ts` beside the equivalent environment and selection exports.

`editor/shell/shell-providers.tsx`, the module that owns the editor shell's provider pyramid,
mounts one `SceneSessionProvider`, created once per shell instance, inside
`SessionStateProviders` beside `EnvironmentSessionProvider`; `editor-shell.tsx` renders that
pyramid around the frame. That places the provider
above `ViewModeViewport`, so the store outlives every mount and unmount of the preview subtree
that a view-mode switch triggers. `ViewModeViewport` itself is unchanged: it keeps rendering the
preview subtree only for `preview` and `split`, so the subtree still fully unmounts in plan mode.
The change moves the state's home; the subtree still comes and goes as before.

Each hook that used to own a slice of this state locally now seeds its starting value from the
store on mount and writes every change back to it, instead of defaulting fresh each time.
`useSceneNavigation` moves first: camera mode, the selection and reveal-interior toggles, and the
applied preset pose all come from the session snapshot, and `userControlled` seeds `true`
whenever the store already holds a saved camera position, so a remount does not trigger a
reframe. The building-scope and underground-visibility hook, the edge-overlay hook, the view's
color-temperature hook, and the walk controller's saved pose and open-door ids follow the same
pattern in their own cycles. Because these hooks also render outside `EditorShell`, in stories
and in isolated component tests, the context layer falls back to a private, per-mount store when
no provider is present (`useSceneSessionStoreOrLocal()`), so nothing outside the shell has to
construct a provider just to render.

Camera pose restoration takes two different shapes because the two camera modes differ in what
the bridge layer can actually observe. Orbit mode restores position only: `OrbitCameraControls`
wraps `engine/scene/orbit-controls.ts`'s `OrbitController`, whose surface is write-only
(`setTarget`, no getter), so the pivot target left by a manual pan cannot be read back without an
engine change, and this decision does not make one. Walk mode restores everything (position, yaw,
pitch, and the set of open door ids) because `WalkState` and `OpeningInteractionState` are already
plain values passing through refs in `bridge/react/walk-camera-controls.tsx`. The same store
write also keeps the walk pose across an orbit round trip within a single mount, not only across
a remount: entering walk mode used to reseed from the live camera every time, even when the
controller itself never unmounted.

Proxy positions, the on-screen accessibility targets that track each entity, are named in the
issue but excluded here on purpose. They are a per-frame projection recomputed continuously from
the live camera and scene root, so restoring a stale array on remount would show proxy targets at
coordinates from before the remount, worse than the frame or two they already take to repopulate
on their own.

## Consequences

`SceneSessionProvider` becomes a new permanent surface off `bridge/index.ts`, alongside
`EnvironmentSessionProvider` and the selection store. Any test or story that renders a piece of
the preview subtree standalone, outside `EditorShell`, needs to construct it going forward, the
same retrofit shape the environment-session store already established.

This record amends ADR-0146's stance on view color temperature. That record kept the field out of
`EnvironmentState` because it is the schematic rig's tint rather than part of the persisted
environment model, and called it "view-local" on that basis. It still is not part of
`EnvironmentState`, and the rest of that contract (mode, observed time, cloud cover, the color
check) is untouched; but "view-local" no longer means "discarded on remount." The field now lives
in the scene session store alongside the rest of the preview's session state.

A few things still reset on a view-mode switch, and this decision does not change that. The R3F
canvas and its Three.js camera object are torn down and rebuilt on every mount; that state was
never serializable and is not preserved here. The orbit pivot target is not restored, only
position, so the first drag after returning to 3D pivots on the model's framed centroid rather
than the exact point the viewer last panned to. Proxy positions repopulate over the first frame or
two after a remount rather than restoring instantly, by design, as explained above.

The change also fixes a second, related bug for free: a walk-orbit-walk round trip within one
mount used to reseed the walk pose from the live camera every time the mode toggled back to walk;
it now reads the last saved walk pose instead, so the walk position holds steady across an orbit
detour.

A true fix for the orbit pivot target needs a read-back method added to
`engine/scene/orbit-controls.ts`'s `OrbitController`, which is an engine-layer change outside this
decision's scope; track it as a follow-up rather than folding an engine edit into a bridge-layer
lane.

## Alternatives considered

Keep the preview subtree mounted at all times and hide it with styling instead of unmounting it,
so nothing needs saving or restoring in the first place. Rejected: nothing in the codebase pauses
a hidden view today. The live canvas runs with an always-on frame loop unconditionally, and the
walk controller's keyboard and pointer listeners are gated only on an `enabled` prop, not on
visibility, so a hidden mount would keep driving the walk camera in the background while the
viewer works in the plan. A hidden parent also collapses the canvas's measured size to nothing,
which would need an explicit resize on reveal to recover correctly. Building all of that is new
surface area with no existing pattern to extend, and it breaks an existing end-to-end assertion
that checks for the 3D region's absence from the DOM in plan mode, not merely its visibility.

Restore state on remount without a shared store, by threading saved values down as props from
whatever level already survives the switch. Rejected: nothing in the current component tree
survives a view-mode switch except `EditorShell` and the providers it already mounts. Reaching
that state down through props to each consuming hook would mean building separate, one-off
plumbing per field, duplicating what the environment-session store already established as the
shape for this exact problem.

Hold the state on a field in the persisted building model instead of a bridge-owned store.
Rejected on the same grounds ADR-0020 gives for 2D selection: this is state about where the
viewer is looking, not content of the building, and letting a camera nudge, a preset pick, or a
door opened for a walkthrough appear as an undoable edit would be wrong, and not
only inconvenient. Session state stays outside `core/` and outside undo.
