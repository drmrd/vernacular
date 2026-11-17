---
slug: decisions/ADR-0217-a-moved-mesh-reaches-the-gpu
title: 'ADR-0217: A patch of three.js 0.184.0 uploads a moved mesh again when it draws after another mesh with the same shader'
type: decision
tags: [rendering, engine, three-js, webgpu, dependencies, openings, doors, patch]
related:
  [
    decisions/ADR-0198-open-doors-follow-the-scene-session,
    decisions/ADR-0128-opening-animation-motion-model,
    decisions/ADR-0004-three-js-r3f-webgpu,
    decisions/ADR-0171-live-view-ci-render-lane,
  ]
sourceFiles:
  [
    patches/three@0.184.0.patch,
    package.json,
    pnpm-lock.yaml,
    engine/scene/moved-mesh-upload.test.ts,
    engine/scene/opening-motion.ts,
    engine/scene/opening-fill-builder.ts,
    core/scene/opening-fill.ts,
    core/scene/opening-openness.ts,
    bridge/react/walk-interaction.ts,
  ]
status: current
updated: 2026-11-17
---

# ADR-0217: A patch of three.js 0.184.0 uploads a moved mesh again when it draws after another mesh with the same shader

## Status

Current. Accepted on 2026-11-17, with the commits "test: expect a moved mesh that draws second to
be uploaded again" and "fix: upload a moved mesh again when it draws after another mesh with the
same shader". It supersedes nothing and changes no rule of ADR-0198 or ADR-0128. It lets the door
swing that they describe show its last pose.

## Context

In the live 3D view, a person can shut a door with the "Close doors and windows" control of the 3D
toolbar, or with the reset key in walk mode. The door can then stay drawn part-open, while the
session holds no open door. It stays that way until something moves it again or the scene is
rebuilt.

The swing runs at 4 openness units per second (`OPENNESS_RATE_PER_S` in
`core/scene/opening-openness.ts`), so a full swing takes a quarter second. `tickOpenings` in
`bridge/react/walk-interaction.ts` moves each opening one step per frame with `advanceOpenness`
and stops once the opening reaches its target. The fault needs a last step before shut that leaves
a pose a person can see. By the diagnosis of 2026-11-17, in the room of the journey below, that
means an openness above about 0.035. At 10 frames each second a step is 0.4, so a door closing
from fully open passes 0.6 and 0.2 and then lands shut, and the fault is almost certain. At 60
frames each second a step is about 0.067. Whether the fault shows at that rate was not measured.

## Cause

The cause is in `three` 0.184.0, the renderer library this project pins. The function is
`NodeMaterialObserver.needsRefresh`, in `src/materials/nodes/manager/NodeMaterialObserver.js` of
the package. The renderer calls it once for each render object in each render, in draw order. A
true answer makes the renderer upload that object's data again, its world matrix included.

Render objects with the same shader share one observer. The library caches its node builder state
by the render cache key, and the observer lives on that state. For the first render object of an
observer in a render, the function returned `true` at once and skipped `equals()`. `equals()` is
also the step that copies the object's world matrix into the observer's record. So the record of
the object that drew first was not kept in step with what was uploaded. An object that draws later
in the same render is uploaded only when its world matrix differs from that record.

Doors and hung windows meet this through their materials. `buildOpeningFill` in
`engine/scene/opening-fill-builder.ts` calls `materials.material(part.role)` with no surface
reference, and both providers cache one material for each role. In `core/scene/opening-fill.ts` a
door leaf has the role `leaf`, and so does every bar of a sash (the rails and the stiles, through
`leafBar`). Only the glass has the role `glass`. So a door leaf and the bars of a hung window get
the same material object, the same shader, and one observer.

The renderer sorts opaque objects of the same group and render order by their depth from the
camera. In the case that failed, the sequence was:

1. The scene is built with the door shut. The leaf draws after the window bars, so `equals()` runs
   for it and its record holds the shut pose.
2. While the door is open, the leaf is nearer the camera and draws first. It is uploaded in every
   frame, but through the early return, so its record stays at the shut pose.
3. The close swing lands on shut. The leaf draws after the bars again. Its world matrix now equals
   the stale record, so the observer answers `false` and nothing is uploaded.
4. The GPU keeps the last part-open pose, for example openness 0.2.

### Why it showed now

`main` has had the defect all along, since it is in the library. The hung-window sash work
(ADR-0216, in a later change) moves the lower sash of a hung window 25 mm toward the room. In the
room of the journey below, that puts the window bars in front of the shut door leaf for the orbit
camera, which changes the draw order at the end of the swing. On 2026-11-17, on the development
Mac, a build equal to `main` passed the journey twice. The build with the sash change failed it,
and with the 25 mm offset turned off it passed.

## Decision

Patch `three` 0.184.0 through pnpm. The `pnpm` object of `package.json` gets a
`patchedDependencies` entry, `"three@0.184.0": "patches/three@0.184.0.patch"`, and `pnpm-lock.yaml`
records the patch hash on the `three` entries. No other package changes.

The patch changes `needsRefresh` in three files of the package:
`src/materials/nodes/manager/NodeMaterialObserver.js`, `build/three.webgpu.js`, and
`build/three.webgpu.nodes.js`. The first render object of an observer in a render still gets
`true`, because the shared uniform buffers must be updated once in each render. But the function
no longer returns early. It runs the `equals()` pass, which keeps the record in step, and returns
the first-in-render answer or the result of `equals()`. Static and bundled objects get the same
answers as before: `true` for the first in a render and `false` after it. This is the logic of
`three` 0.186.0 for this function, in the boolean form of 0.184.0.

The application imports `three/webgpu`, which the package resolves to `build/three.webgpu.js`.
Plain `three` resolves to `build/three.module.js`, which has no observer. The two minified builds,
`build/three.webgpu.min.js` and `build/three.webgpu.nodes.min.js`, keep the old code. Nothing in
this project imports them. No source file in `engine/`, `bridge/`, `core/`, `editor/`, or `app/`
changes.

## Alternatives considered

**Upgrade to `three` 0.186.0.** Published on 2026-09-08, it removed the early return, with the
comment "no early out here. instead, use the equals() code path below so the internal cache state
gets synched". 0.185.1 still has the early return. On 2026-11-17, in a disposable worktree on
macOS, both fixes ran the type check, the lint, the unit suite, the build, the 55 tests of the
`scene-webgl` project, and the journey twice. With the patch the unit suite passed (5564 tests),
all 55 scene tests passed, and the door read shut in both runs. With the upgrade the unit suite
passed and the door read shut in both runs, but three scene tests failed:

- the ambient occlusion interior capture, with 0.57 of the pixels different;
- the glossy floor of the finish contrast state, with 0.58 different;
- the ambient occlusion gate "crease darker than open floor", which read 0.0094 against a minimum
  of 0.0095.

The tone curve reading moved from -0.05 to -0.64. So the upgrade changes the rendering, and it
needs its own change with new baselines. It is the right end state. A follow-up issue asks for it,
and that change removes the patch. It lost here only because it cannot land as a small fix.

**Upgrade to `three` 0.187.0.** Published on 2026-10-30, it was inside the 30-day dependency
cooldown on the day of this decision. It would also carry the rendering changes of 0.186.0.

**Replace the function at run time from `engine/`.** `three/webgpu` exports the observer class, so
code in `engine/` could assign a corrected `needsRefresh` to its prototype when the renderer
starts. It lost because it is fragile. It changes a library class from our own code, where a
reader of the library source cannot see it. At an upgrade it would quietly replace the new function
of 0.186.0, which answers with a number code, with the old boolean form. A patch entry names the
exact version it fits, and the install shows it.

**Nudge the door so that its pose differs from the record.** The opening motion could set a shut
door a hair off its built pose, or touch the matrix once more after the swing. It lost because it
hides the cause and covers only doors. Any other moving mesh that shares a shader would keep the
fault, and the shut pose would no longer equal the built one, which ADR-0128 relies on.

## Evidence

`engine/scene/moved-mesh-upload.test.ts` builds the library's observer for one material and asks
it, in draw order, whether each of two plain render objects needs an upload, as the renderer does
in each render. It reads the answer with `Boolean(...)`. Its three cases prove these points:

1. A door leaf in a group and a window bar share the observer. Two renders with the bar first and
   the door shut, then a swing through openness 0.4, 1, 0.6, and 0.2 with the leaf first, then
   openness 0 with the bar first. The leaf must be uploaded in that last render. This case failed
   on the unpatched 0.184.0, at the assertion on the last render, and passes with the patch.
2. A mesh that did not move, drawn second in two renders in a row, needs no upload in the second.
   The fix does not turn every object into an upload in every frame.
3. The first render object of the observer in a render needs an upload, moved or not.

Cases 2 and 3 pass before and after the patch. The unit test is not tied to macOS.

The journey `e2e/tests/journeys/close-doors-and-windows.spec.ts` reads the door on a live WebGPU
view. On 2026-11-17, on the development Mac, a build with the hung-window sash change failed its
first test in four of four runs. The check "the door shut in orbit mode" read a mean difference of
12.1, 13.6, 16.9, and 14.5, against a limit of 1. A probe that waited 3 seconds after the click
read 45 drawn frames, and the door was still part-open. With the patch, the same check read 0.000.
The 55 tests of the `scene-webgl` project passed with the patch, against the committed baselines,
with no update. The journey and the scene tests ran on macOS only. The macOS live-view job of
ADR-0171 runs the journey in CI. A build of `main` without the sash change passed the journey even
without the patch, so that job alone does not prove the fix.

## Consequences and limits

- The patch must go when `three` is upgraded, in the same change. Its entry names 0.184.0 only.
- The guard test reads an internal module of the library. A later version can move or rename it,
  and then the test fails at the import. In 0.186.0 the observer also reads `renderObject.scene`,
  and `needsRefresh` answers with a number code where zero means no upload. The plain render
  objects of the test may then need a `scene` field. `Boolean(...)` already reads the number code.
- The corrected function runs `equals()` for one more render object in each render, for each
  observer. That cost was not measured.
- Any mesh that moves and shares a shader with other meshes was exposed, not only doors: a sliding
  sash, for example. The patch is in the library function, so it covers them all. No test here
  proves each one.

## How to remove the patch

1. Upgrade `three` to 0.186.0 or later, with the new scene baselines that the upgrade needs.
2. Delete `patches/three@0.184.0.patch` and the `three@0.184.0` entry of `patchedDependencies` in
   `package.json`. Run the install so that the lockfile drops the patch hash.
3. Run `engine/scene/moved-mesh-upload.test.ts` and the scene tests. Case 1 must pass on the
   library alone. If the observer module moved, point the import at its new home.

## References

ADR-0198 and ADR-0128 for the doors and their motion, ADR-0004 for the renderer stack, and
ADR-0171 for the macOS live-view job.
