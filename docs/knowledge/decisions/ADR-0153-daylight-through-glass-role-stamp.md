---
slug: decisions/ADR-0153-daylight-through-glass-role-stamp
title: 'ADR-0153: Daylight through glass via the opening-fill role stamp'
type: decision
tags: [architecture, engine, bridge, app, rendering, shadows, openings, testing, 3d-preview]
related:
  [
    decisions/ADR-0148-visible-sky-and-sh-light-probe,
    decisions/ADR-0149-harness-lighting-readiness,
    decisions/ADR-0151-ambient-occlusion-render-pipeline,
    decisions/ADR-0152-linux-scene-baseline-lane,
  ]
sourceFiles:
  [
    engine/scene/opening-fill-builder.ts,
    engine/scene/shadow-casters.ts,
    engine/lighting/lighting-rig.ts,
    engine/lighting/basic-lighting-provider.ts,
    engine/lighting/solar-lighting-provider.ts,
    bridge/react/scene-harness-view.tsx,
    bridge/react/webgpu-scene-view.tsx,
    app/harness-environment.ts,
    e2e/tests/scene-solar.spec.ts,
  ]
status: current
updated: 2026-07-05
---

# ADR-0153: Daylight through glass via the opening-fill role stamp

## Status

Accepted, lands with issue #444, the second slice of the realistic-lighting spine after ambient
occlusion [[ADR-0151-ambient-occlusion-render-pipeline]]. A room with a sunlit window now reads as
lit instead of sealed: the sash frames and meeting rail cast their pattern onto the floor while the
glass panes pass light.

## Context

Every mesh in a built scene cast shadows, glass included, so a window blocked sunlight exactly like
the wall around it. The epic's later stained-glass work also needs a way to find glass panes in a
built scene without guessing from material names.

Three shapes were considered for the shadow exception:

1. Material-name matching in the shadow flagger. Rejected: slice 3 (issue #449) replaces the glass
   material with a transmissive one, which would silently break a name match.
2. Shadow-camera layers. Rejected: Three.js offers 32 layers globally, several already claimed;
   spending one on glass couples an engine-internal rule to a scarce shared resource.
3. A build-time role stamp on the mesh. Chosen, detailed below.

## Decision

The opening-fill builder stamps every part mesh it builds with its `OpeningFillRole` (`leaf` or
`glass`) in `userData`, under the shared key exported as `OPENING_FILL_ROLE_KEY`. The stamp is
uniform across both roles, so a reader never distinguishes an absent stamp from a leaf.

One exported predicate, `isGlassPane(object)`, reads that stamp: true for exactly a mesh stamped
`glass`. `markShadowCasters` keeps its whole-tree walk and sets `castShadow = !isGlassPane(object)`;
every mesh still receives (`receiveShadow = true`), because a frame's shadow across a pane is
physically right. The predicate is exported from the engine barrel as the seam the stained-glass
cookie slice will use to collect panes; this slice ships no cookie code.

The rule lives on the mesh, not the material, so the slice 3 material swap cannot break it. The
role enum stays in core; the stamp and predicate are engine; no model or schema change is involved.

### The window-light harness state and the environment camera pose

The proof is a new canonical harness state, `window-light`: the shell fixture under a
summer-solstice 09:00 Eastern sun (due east, the reference instant from the core solar cases),
framed from inside the room. The shared equinox-noon instant cannot show the effect because the
shell's only window faces east and that sun grazes it.

The interior vantage needed a camera seam the harness did not have: `HarnessEnvironmentState` (app)
and `HarnessEnvironment` (bridge) gain an optional `cameraPose`, and one pure resolver,
`resolveHarnessCameraPose`, picks the camera with a fixed precedence: an environment-supplied pose
wins, then the per-geometry override (`adjacent-rooms`), then the auto-frame. Attaching the pose to
the environment state rather than duplicating a geometry key keeps the plain shell's standing frame
byte-stable for the schematic baselines.

## The shadow pipeline was dead: two defects found and scoped

The acceptance capture exposed that no sun shadow had ever rendered in this app.

First, React Three Fiber overwrites `gl.shadowMap.enabled` with `!!shadows` while configuring a
Canvas, so the flag `createSceneRenderer` sets at construction was reverted on both canvases, which
never passed the prop. The rig's `castShadow`, bias, and frustum fitters were all dead code. Both
canvases now pass `shadows`, and a source-reading guard test pins the prop the same way the
ambient-occlusion import guard pins its bundling property.

Second, with shadow maps actually on, the schematic sun angle blackened every steep face wholesale:
full-face self-shadowing that survived bias sign flips, `normalBias` up to 30 mm, `shadowSide`
overrides, and a freshly built light, identically on the Metal and SwiftShader backends. Realistic
states render shadows correctly at their sun angles, including the window-light beam. Shadow
casting is therefore a provider policy, the same shape as the sun-intensity policy
`buildLightingRig` already owns: the solar provider's sun casts, the basic provider's does not. Schematic states
keep rendering exactly as their committed baselines on both families. A follow-up issue records the
investigation and the exit criteria for restoring schematic shadows; the committed `SHADOW_BIAS`
also needs re-deriving once the upstream behavior is sound, since it was authored while the
pipeline was dead.

## Consequences

- Sun shadows now render in realistic mode, in the live view and the harness. The window-light
  baseline pins the headline: two sunlit pane patches on the floor split by the meeting rail's
  shadow.
- No existing scene baseline moved on either family. The shadow rule's schematic-mode visibility
  turned out to be zero (that family's sun no longer casts), the inverse of the plan's expectation
  that the schematic shell family would shift while solar held.
- The stale darwin schematic baselines (last refreshed 2026-06-14, before the ground plane) were
  masked by the dead pipeline and still diverge from the linux family on the lawn; the follow-up
  issue carries that observation.
- Later slices attach to named seams: the stained-glass cookie to `isGlassPane`, the material swap
  to the role stamp, interior vantages to the environment camera pose.
- The default solar states still show no daylight through glass (east-facing window, south-leaning
  shared instants); a deferred follow-up gives the shell a south-facing window so the equinox
  family also demonstrates it.
