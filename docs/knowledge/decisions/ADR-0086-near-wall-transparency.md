---
slug: decisions/ADR-0086-near-wall-transparency
title: 'ADR-0086: Near-wall transparency in the three-dimensional preview'
type: decision
tags: [architecture, three-dimensional, transparency, walls, camera, preview]
related:
  [
    decisions/ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier,
    decisions/ADR-0067-three-dimensional-painted-preview,
    decisions/ADR-0078-three-dimensional-preview-surface-edges,
    decisions/ADR-0084-discoverable-camera-controls,
    decisions/ADR-0217-a-moved-mesh-reaches-the-gpu,
    decisions/ADR-0218-exterior-walls-follow-the-rooms-along-the-wall,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-near-wall-transparency.md,
    docs/plans/2026-06-15-near-wall-transparency.md,
    core/scene/exterior-walls.ts,
    core/scene/interior-viewpoint.ts,
    core/scene/camera-outside-building.ts,
    engine/scene/near-wall-transparency.ts,
    bridge/react/webgpu-scene-view.tsx,
    bridge/react/framed-scene.ts,
    bridge/react/framed-scene-reconciler.ts,
    bridge/react/near-wall-fade.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    engine/scene/near-wall-transparency-recompile.test.ts,
    engine/scene/near-wall-transparency-test-support.ts,
    e2e/tests/journeys/walk-view-after-rebuild.spec.ts,
  ]
status: current
updated: 2026-11-19
---

# ADR-0086: Near-wall transparency in the three-dimensional preview

## Status

Accepted. Issue #122, owner feedback that an opaque exterior wall blocks the interior
when the camera looks at the building from outside. It builds on the wall shell
([[ADR-0061-three-dimensional-wall-shell-junctions-and-visual-tier]]) and the painted
preview's material seam ([[ADR-0067-three-dimensional-painted-preview]]).

## Context

The preview draws every wall solid. When the camera sits outside the building and
looks in, the near exterior wall fills the frame and hides the rooms. The owner wants
those near walls to fade to about ninety percent transparent so the interior is
visible from outside, and to return to solid as the camera moves to where they no
longer block the view.

Two questions sit underneath. Which walls should fade, and how does a per-wall,
camera-driven opacity reach the renderer when the neutral material provider caches one
material per surface role and shares it across every wall.

## Decision

Fade an exterior wall when the camera is on its outside, and drive the opacity per
frame from the live camera. Three small pieces.

The exterior decision is pure core. A wall has two faces offset from its centerline by
half its thickness along the wall normal. A face is outside when a point just past it
lies in no room and inside when that point lies in a room, tested against the room
clear polygons with the existing point-in-polygon helper. A wall with one outside face
and one inside face is exterior, and its outward normal is the outside face's
direction; a wall with a room on both sides is an interior partition and never fades.

The material handling is an engine pass. Because the provider shares one material per
role, an exterior wall cannot get its own opacity without its own material, so a
build-time pass clones each exterior wall mesh's materials into private instances and
records the wall's outward normal and a point on it, in world space, on the mesh.
Interior walls keep the shared materials.

The fade is a per-frame update from the camera. For each prepared wall it asks whether
the camera lies on the outward-normal side of the wall point; if so the wall stands
between the camera and the interior, so its private materials go transparent with depth
writing off, and otherwise they are solid. The test is horizontal, so the camera height
does not matter. The exterior decision and the camera-side decision are pure and unit
tested; the material pass is tested on a built scene; the build seam that prepares the
targets is unit tested; and the per-frame wiring is rendering glue carried in the live
preview and confirmed by inspection. A committed pixel baseline of the rendered effect is
deferred (see the consequences).

The fade runs in orbit only. While the camera walks on the floor it sits inside the
building, where fading the surrounding walls reads as a glitch rather than a help, so the
per-frame wiring gates on the camera mode: in walk mode it restores every prepared wall to
its recorded baseline instead of testing the camera side. A dedicated restore step in the
engine keeps that path a named, single-purpose call rather than a flag on the fade. This is
a first cut of the broader plan to make transparency a toggle that follows whether the
camera is grounded (issue #256).

## Alternatives considered

- **Occlusion trigger.** Fade the walls that actually occlude the room the camera looks
  at, by ray-casting from the camera. It is more precise than the front-facing side
  test, but it needs per-room ray-casting every frame and a definition of which room is
  the subject. The side test is one dot product per exterior wall and matches the common
  case (the near facade) well, so it is the first cut; the occlusion trigger can replace
  it later if the side test proves too blunt.
- **Per-wall materials at build time for every wall.** Give every wall its own materials
  so any of them can animate. Rejected as wasteful: only exterior walls ever fade, so
  only they need private materials, and cloning them in a focused pass keeps the common
  interior walls on the shared, cached materials.
- **A smooth opacity ramp by angle or distance.** A gradual fade reads more softly than a
  binary solid-or-transparent switch, but it adds tuning with no clear target, so the
  binary fade at one fixed transparency ships first.

## Consequences

- The near exterior walls fade when the camera is outside them and return to solid from
  the other side, so the interior is visible from outside. This closes issue #122 for
  the front-facing case.
- The front-facing side test is now additionally gated by whether the orbit camera lies
  outside the building footprint. `cameraOutsideBuilding` in core inverts the camera's
  world position back to plan space and tests it against the room polygons, and the bridge
  wires that gate to the fade, so a near wall fades only when the camera is genuinely
  outside the rooms rather than merely on the wall's outward side. This advances the issue
  #256 plan for transparency that follows whether the camera is grounded.
- The exterior decision and the camera-side decision are pure, unit-tested core, so the
  rule for which walls fade is verified without the renderer.
- Only exterior walls carry private materials; interior walls keep the shared materials,
  so the cost is bounded to the walls that can fade.
- The live preview carries the effect, wired per frame to the camera. A committed pixel
  baseline of it through the deterministic harness is deferred, because that baseline is
  per-platform and cannot be regenerated across targets in this pass; the unit and engine
  tests cover the logic in the meantime.
- The front-facing trigger, the binary fade, and opening-body fading are deferred,
  recorded in the spec.
- The deferred user toggle shipped (issue #257). A "Reveal interior" control sits in the
  primary cluster of the three-dimensional scene navigation toolbar and defaults to on; its
  `revealInterior` state threads through `useSceneNavigation` in
  `bridge/react/webgpu-scene-view.tsx` and gates the fade at
  `<NearWallFade enabled={mode === 'orbit' && revealInterior}>`. The shared `ToolbarToggle`
  in `bridge/react/scene-nav-toolbar.tsx` renders it, and it stays inert while walking
  because the fade still needs orbit mode.

## Note 2026-11-15: the faded state also decides picking

A faded object no longer takes a click, for the selection and for the paint target alike, so a
click on a faded wall goes to what is behind it. The fade marks each material it fades, and the
pickers skip a hit on a marked object. The details are in the 2026-11-15 amendment to
[[ADR-0056-surface-paint-selection-and-treatments]].

## Note 2026-11-17: the fade works by exterior run

The exterior decision above no longer tests points past the faces. Since
[[ADR-0218-exterior-walls-follow-the-rooms-along-the-wall]], `exteriorWalls` lists exterior runs,
the stretches of a wall with a room along one side only, read from the room boundaries, and the
fade builds one target for each run. A long wall now fades only where it has open air on one side,
and the stretch between an ell and the main block stays solid.

## Note 2026-11-19: a fade that changes a draw flag marks the material

What a user saw (issue #781). In the 3D view, a scene rebuild could change the walk view of a room.
Turning Surface edges on and off in orbit mode did it, and so did a paint edit. After the rebuild, a
shut door leaf in front of the walker was lit as if it faced the sun. In realistic lighting it also
lost its ambient occlusion.

A second effect had the same cause and was easier to meet. A wall that was solid at its first draw
did not visibly fade when the orbit camera later moved outside it. Its program was built for an
opaque material, and such a program writes an alpha of 1, so the wall stayed solid at any opacity.

The cause. The fade turns a material's `transparent` and `depthWrite` flags on and off. The renderer
builds a shader program for a material at its first draw. It builds a new one only when the material
is marked with `needsUpdate`, or when the scene's lights or environment change, and the fade never set
that mark. Take a scene rebuild made while the
orbit camera stands outside a wall with a door. The fade reaches the new door leaf before its first
draw. The leaf's material is double-sided, and the renderer draws a transparent double-sided
material as two single-sided passes. So the leaf's program was built for a transparent, single-sided
draw, and the leaf kept that program when the fade ended. That program does not flip the normal of a back
face. The leaf's outer faces need that flip, so a face turned away from the sun was lit as if it
faced it.

The rule. `applyFadeState` is the one place that writes the two flags. It now writes them through a
small helper, `setDrawFlags`, which sets `needsUpdate` on the material when either flag actually
changes. Opacity alone needs no new program, so a change of opacity marks nothing.

Why the mark is conditional. The fade runs on every frame. A call that changes no flag marks nothing,
so a steady frame pays for no new program. A material gets a new program only when its wall starts
or stops fading: when the camera crosses to the other side of the wall, or when the wall joins or
leaves the set of fading walls. [[ADR-0217-a-moved-mesh-reaches-the-gpu]] records another case where
the renderer kept old GPU state after a change it did not see.

Evidence. A journey test on a live WebGPU view, `e2e/tests/journeys/walk-view-after-rebuild.spec.ts`,
takes the walker's view of a shut door, rebuilds the scene in orbit mode, and compares the walker's
view afterward with the first one. Both pictures come from the same run; no picture is stored. On the
development Mac the test failed in three of three runs before the fix. The mean channel difference
was 24.353 against a limit of 1, and the changed fraction was 0.757 against a limit of 0.01. After the
fix it passed in three of three runs, with both figures at 0.000.

A second test in the same file holds the wall effect. It rebuilds the scene from the default camera,
so that the north wall's first draw is solid, moves the orbit camera to the north, and compares that
view with the view after one more rebuild, in which the wall is faded at its first draw. Before the
fix the mean channel difference was 3.077 and the changed fraction was 0.042. After it both are
0.000.

The tests of that file run in the macOS live-view job of CI (`.github/workflows/ci.yml`). There, a
runner with no WebGPU adapter fails the step instead of skipping it.

The unit tests in `engine/scene/near-wall-transparency-recompile.test.ts` pin the mark:

- "raises the version of each material the fade changes by exactly one"
- "raises the version of each material the restore changes by exactly one again"
- "keeps every version when a second update runs from the same camera outside"
- "keeps every version when an update from inside the room finds every target at baseline"
- "keeps every version when a restore finds every target at baseline"
- "never changes the version of a window glass pane through a fade and a restore"
- "raises a dropped faded material by one and leaves a still-enrolled one alone"

Not measured. The cost of one new program when a wall starts or stops fading has not been timed. It
is a shader lookup or a compile at the next draw of that material. A review counted the materials
that one flip marks in the test fixtures: 7 for a wall with a door and 15 for a wall with a window,
whose two panes are not marked.

Issue #903 reported what looked like a second fault: a wall of a room that was drawn step by step in
split view stayed solid from outside until a full rebuild. A later check found the same cause. With
the mark in `setDrawFlags`, the steps of the issue give a mean channel difference of 0.000 and a
changed fraction of 0.000. With the mark taken out, they give 3.077 and 0.042, the figures in the
issue. The north wall is solid at its first draw, from the default camera, and the North preset then
fades it. The step-by-step drawing and the openings play no part: with the mark taken out, a room
drawn with the 3D pane closed and with no openings fails in the same way.

The fade does follow each incremental build. After every build of those steps, each drawn material
of the north wall and its openings belongs to the wall's fade target, with a solid baseline. Opening
the full 3D view mounts the scene view again, and its new reconciler builds the whole scene once from
the finished plan. So in the steps of the issue the North preset never meets the materials of the
step-by-step builds.

Two more tests in `walk-view-after-rebuild.spec.ts` hold this. The third follows the steps of the
issue, with no rebuild before the North preset. The fourth presses North in the split pane, where the
materials are the ones that the step-by-step builds made. With the mark taken out, that case gives a
mean channel difference of 5.348 and a changed fraction of 0.076. With the mark it gives 0.000 and
0.000.
