---
slug: decisions/ADR-0233-aim-guide-in-walk-mode
title: 'ADR-0233: Walk mode shows an aim dot and outlines the opening in reach'
type: decision
tags: [bridge, engine, three-dimensional, walk, openings, toolbar, session-state, accessibility]
related:
  [
    decisions/ADR-0198-open-doors-follow-the-scene-session,
    decisions/ADR-0216-hung-window-sashes-stay-in-their-frame,
    decisions/ADR-0170-scene-session-state-in-a-bridge-provider,
    decisions/ADR-0132-surface-edge-overlay-opt-in-view-toggle,
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0232-the-editor-fills-the-failure-view-slot-of-the-3d-pane,
  ]
sourceFiles:
  [
    core/scene/opening-aim-outline.ts,
    core/scene/opening-span-ends.ts,
    engine/scene/aim-outline.ts,
    bridge/react/walk-aim.ts,
    bridge/react/walk-interaction.ts,
    bridge/react/use-walk-aim-outline.ts,
    bridge/react/walk-camera-controls.tsx,
    bridge/react/aim-reticle-style.ts,
    bridge/react/scene-pane-shell.tsx,
    bridge/react/scene-display-options.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/scene-view-toolbar.tsx,
    bridge/react/use-scene-navigation.ts,
    bridge/scene-session/scene-session-store.ts,
    bridge/react/live-scene-view.tsx,
  ]
status: current
updated: 2026-11-22
---

# ADR-0233: Walk mode shows an aim dot and outlines the opening in reach

## Status

Current. Landed with issue #389. The owner chose to build the aim guide on 2026-11-22 and made the
choices listed under Decision. This record builds on
[[ADR-0198-open-doors-follow-the-scene-session]] and
[[ADR-0216-hung-window-sashes-stay-in-their-frame]] and supersedes nothing.

## Context

In walk mode the E key opens or shuts the door or window in reach (ADR-0198). Until now nothing on
screen showed where the walker was looking or which opening E would act on. A double-hung window
made this worse: the reach test picks the upper or the lower sash by the height the look hits
(ADR-0216), and the walker had no way to tell which sash that was before pressing the key.

## Decision

Walk mode shows two marks: an aim dot at the middle of the pane, and an outline on the opening that
is in reach.

### The aim dot

The dot is a DOM element of the pane, not an object in the scene. `ScenePaneShell`
(`bridge/react/scene-pane-shell.tsx`) renders it in walk mode while the aim guide is on. It is
`aria-hidden` and lets the pointer pass through, so it never blocks a look drag.

The dot is cased by hand: a white dot 6 px across with a dark keyline (`#1a1a1a`) 1 px wide. A unit
test checks that the dot or its keyline holds 3:1 contrast against each of the 256 grays from black
to white, and that the dot and the keyline hold 3:1 against each other. The colors and sizes live
in one constant, `AIM_RETICLE` in `bridge/react/aim-reticle-style.ts`. The design language
(`docs/specs/2026-07-06-arris-visual-design-language.md`, "The cased mark") calls for one cased-mark
token that covers the walk reticle along with the other marks drawn over uncontrolled ground. When
that token exists it replaces the constant.

The dot sits inside `SceneChrome` beside the camera controls hint. When the renderer fails and a
failure view takes the pane, the dot hides with the rest of the scene chrome
([[ADR-0232-the-editor-fills-the-failure-view-slot-of-the-3d-pane]]).

### The outline

The outline marks what E acts on, because it comes from the same reach call. `reachFromWalk` in
`bridge/react/walk-interaction.ts` runs the reach test for a walk pose. The E key calls it through
`interactFromWalk`, and `aimFromWalk` (`bridge/react/walk-aim.ts`) calls it for the outline, so the
two cannot disagree. `openingAimOutline` (`core/scene/opening-aim-outline.ts`) turns the hit's band
into four corners on the opening's shut frame. For a door the band is the whole frame. For a
double-hung window it is one sash: the sill to the meeting rail, or the meeting rail to the head.
`aimFromWalk` then lifts the corners to the active floor's elevation.

The outline stays on the shut frame while a leaf stands open. It does not trace the moved leaf or
the moved sash. It shows on every reach hit, a fixed window included, even though E moves nothing
there. The owner chose this so that the outline means "this is what the reach test found", with no
second rule about motion.

The engine draws the outline with `createAimOutlineGroup` and `reconcileAimOutline`
(`engine/scene/aim-outline.ts`). The group is added once to the persistent scene, not to the scene
root, which a reconcile rebuilds. It holds one line of five points, the first corner repeated at the
end, rather than a line loop, because the WebGPU renderer of the live view is not sure to close a
loop. A new pose writes into the same position buffer, so no geometry is built each frame. The line
is warm amber (`0xffcc66`), set apart from the white selection outline, and one pixel wide. It is
drawn after the opaque scene with the depth test off, so it also shows through a leaf that stands
open in front of the frame. Glass draws after the line, so a pane in front of the frame tints it. When nothing is in reach the line is removed and its geometry and material are
freed.

The walk controls run the outline step each frame after the walk step and the opening tick
(`useWalkAimOutlineGroup` and `stepWalkAimOutline` in `bridge/react/use-walk-aim-outline.ts`,
called from `bridge/react/walk-camera-controls.tsx`). Outside walk mode, or with the aim guide off, the step
clears the outline. The aim guide flag is read only by the frame callback and is kept out of the
walk session's inputs, so turning the guide on or off never restarts the walk or drops pointer
capture.

### One toggle

One "Aim guide" toggle in the Display options group, after "Surface edges", turns the dot and the
outline on or off together. It is on by default. The flag is `aimGuide` in the scene session store
(`bridge/scene-session/scene-session-store.ts`), and `useSceneNavigation` reads it and toggles it.
Like the other display options (ADR-0132) and the rest of the scene session (ADR-0170), it is view
state: it survives a remount of the view and a view reset, it does not go through
`dispatch(command)`, and it is never stored in the project. The toggle stays visible in orbit mode,
where it changes nothing on screen, as the other display options do.

## Alternatives considered

A reticle drawn in the scene. It would need a camera-facing object, kept at a fixed screen size and
held at the middle of the view on every frame. A DOM element in the pane does that for free, takes
the casing from CSS, and can be checked for contrast in a unit test with no renderer.

Two toggles, one for the dot and one for the outline. Rejected by the owner: the two marks answer one
question, where the walker is aiming, so one control serves both.

An outline of the moved leaf or sash. It would follow the leaf through its swing and need the
motion's pose on every frame. Rejected for now: the frame is what the reach test aims at, and a
fixed shape on the frame reads better while the leaf moves.

Outlining only parts that have a motion, so a fixed window would get no outline. This takes one
filter in `aimFromWalk`. Rejected by the owner in favor of outlining every reach hit.

## Consequences

- The walker sees which opening, and which sash of a hung window, E will act on before pressing it.
- The dot does not change when something is in reach. The outline carries that signal.
- At the collision stop in front of a door the edges of the frame are outside the view, so only the
  dot shows there. The outline appears once the door is within reach and leaves the view on the last
  steps toward it.
- The live journey for the aim guide does not run in the macOS live-view job of CI yet. Issue #1112
  tracks that step. Unit tests cover the corners, the line, the aim, the flag, the toggle, the frame
  step under a mocked frame loop, and the dot.
- When the cased-mark token lands, `AIM_RETICLE` is the one place to replace.
