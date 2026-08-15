---
slug: decisions/ADR-0164-perceived-color-readout
title: 'ADR-0164: Perceived-color readout: sample the drawing buffer inside the frame callback'
type: decision
tags: [architecture, engine, renderer, bridge, editor, color-management, environment, 3d-preview]
related:
  [
    decisions/ADR-0157-color-accuracy-gate,
    decisions/ADR-0156-luminance-calibration-convention,
    decisions/ADR-0161-sky-specular-environment-map,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0142-color-managed-renderer,
    decisions/ADR-0056-surface-paint-selection-and-treatments,
    decisions/ADR-0045-three-dimensional-render-harness-and-conventions,
  ]
sourceFiles:
  [
    core/color/perceived-shift.ts,
    engine/renderer/sample-rendered-color.ts,
    bridge/perceived-color/perceived-color-store.ts,
    bridge/react/perceived-color-sampler.tsx,
    bridge/react/scene-selection.tsx,
    editor/paint/perceived-color-readout.tsx,
  ]
status: current
updated: 2026-08-15
---

# ADR-0164: Perceived-color readout: sample the drawing buffer inside the frame callback

## Status

Proposed. Implements issue #450, the second half of the decorating acceptance path from the
realistic-environmental-lighting epic. The first half, the neutral color-check reference, shipped
with the Environment panel. The owner ratifies.

## Context

Someone picking paint needs two facts at once: the swatch they chose, and what that swatch actually
looks like on the wall at four in the afternoon in December. Those differ, sometimes a lot, because
bounced daylight and the sun's own color temperature push a rendered surface away from its reference
albedo. Mainstream planners show only the first fact, so paint that looked right during planning can
still disappoint once it is on the wall.

[[ADR-0157-color-accuracy-gate]] made the second fact worth showing. It proved that a known swatch
rendered on an interior surface and sampled back lands within 0.06 OKLab of its reference, and it
pinned that number to measurement rather than taste: warm 0.0271, gray 0.0409, cool 0.0447 on the
shell floor under the reference condition, identical on both render backends.
[[ADR-0156-luminance-calibration-convention]] fixed the reference condition itself. Those two ADRs
are what make a sampled number worth printing, because they establish what it should be compared
against.

The design had to satisfy three constraints at once.

The renderer never sets `preserveDrawingBuffer`. `engine/renderer/create-renderer.ts` constructs a
`WebGPURenderer` without it, so the drawing buffer holds a frame only until the compositor takes it.
The end-to-end helpers ran into this and say so in `e2e/tests/scene-helpers.ts`: an in-page
`getImageData` on the live canvas reads an already-cleared buffer, which is why the color-accuracy
gate samples a Playwright screenshot instead of the canvas.

Tone mapping happens on the way to the canvas and nowhere else. Three.js applies the tone-mapping
operator and the output color space conversion when the destination is the default framebuffer, and
skips both when the destination is a render target. A surface's perceived color is a
post-tone-mapping, post-encoding quantity by definition, so a sample taken from a render target
would be linear radiance rather than the color anyone sees.

Ambient occlusion is composited by a per-frame takeover.
`bridge/react/ambient-occlusion-render-takeover.tsx` owns the live canvas draw at `useFrame`
priority 1, routing through the occlusion pass in realistic mode. Occlusion darkens interior
surfaces materially, so a sample that bypassed it would be consistently wrong in exactly the
lighting mode this feature exists to serve.

## Decision

### Sample the canvas inside the frame callback, on demand

Sampling reads the live drawing buffer through a 2D canvas `drawImage`, executed inside a `useFrame`
callback that runs after the render takeover in the same animation frame. That instant satisfies all
three constraints together: the buffer still holds the frame, the pixels are already tone-mapped and
sRGB-encoded, and the occlusion pass has already composited.

Rendering the scene again into an owned render target was the obvious alternative and was rejected.
It costs a second full render, it drops the occlusion composite, and it returns linear radiance
because three.js does not tone-map into render targets. It is more code for a less accurate answer.

The existing end-to-end comment about cleared buffers is not contradicted here, and the distinction
is worth stating because a future reader will trip on it. Those readbacks run from the test runner,
long after the frame. This one runs inside it.

Sampling never runs per frame. `bridge/react/perceived-color-sampler.tsx` reads the store's pending
request and returns immediately when there is none, so an idle scene pays one null check per frame
and no pixel traffic at all. A request is cleared the moment it is fulfilled, which makes the read
one-shot rather than continuous.

### The sample is a small averaged patch, not one pixel

`sampleRenderedColor` averages a 3 by 3 patch centered on the picked point. The radius is derived
rather than chosen for looks. Radius 1 is the smallest neighborhood that averages anything at all,
which damps a single antialiased edge pixel to one ninth of the reading. The upper bound comes from
the 3D view's own definition of sameness: `scene-selection.tsx` already treats a pointer
displacement of up to 6 px as the same click, so a patch of radius 1 sits well inside the region the
pick could have meant and cannot wander onto a surface the raycast did not resolve.

Renderer nondeterminism would argue for a wider patch, and the color-accuracy gate uses 24 px for
that reason. It does not apply here. That gate samples the center of a large flat swatch where
nothing else can intrude, and its measurements found zero spread across backends anyway. The risk
this readout runs is geometric rather than statistical, so a wide patch would trade a real problem
for an imaginary one.

### The seam runs engine to bridge to editor, and never through dispatch

`engine/renderer/sample-rendered-color.ts` takes a `RenderedPixelReader`, an injected interface with
a width, a height, and a `readPixels` rectangle. The NDC-to-pixel mapping and the patch average are
therefore testable in Node with no GPU, following the band split in
[[ADR-0065-three-dimensional-lighting-and-color-temperature]]. Only `createCanvasPixelReader`, the
adapter that wraps a real canvas, is browser glue.

`bridge/perceived-color/perceived-color-store.ts` is a closure store in the house shape, carrying a
pending request in and a resolved sample out. A perceived color is an observation of the render, not
an authored fact, so it is not a command and it is not undoable. The precedent is the `highlighted`
field on `surface-selection-store.ts`, which is hover state on the same non-command footing.

The request carries the `SurfaceRef` the raycast resolved alongside the coordinates, and the sample
carries it back. The readout renders only when that reference matches the surface the inspector is
showing, so a stale sample can never be captioned with the wrong paint.

The readout does not reinvent picking. `commitSelectionAt` already computes normalized device
coordinates and calls `pickSurfaceAt` on every click in the 3D view (ADR-0056), so the readout
requests its sample from that existing call site. Clicking a surface to select it is already the
gesture a person makes when they want to know about that surface, so no separate eyedropper mode is
needed.

### Display convention: the sampled swatch, plus the shift in plain language

The readout shows the sampled color as a chip carrying its own hex, labeled with `readableTextColor`
so the text stays legible against whatever it sampled. Beside it sits a phrase describing the shift
from the assigned paint.

A raw OKLab distance means nothing to the audience, so `core/color/perceived-shift.ts` decomposes the
delta into the two axes a person decorating a room actually talks about: lighter or darker from the L
axis, warmer or cooler from the b axis, which runs blue-negative to yellow-positive. The a axis,
green to pink, deliberately gets no phrase of its own. It rarely dominates a daylight shift, and
naming it would multiply the label combinations for little gain, so a delta that shows up only there
falls back to a generic phrase. The numeric distance stays available for anyone who wants it.

The per-axis call-out threshold is `COLOR_ACCURACY_TOLERANCE / sqrt(3)`, written as that expression.
It is the per-axis share of an isotropic tolerance ball: three axes each sitting exactly at the
threshold produce a total distance of exactly the gate tolerance. This derivation stops the readout
from calling out an axis while simultaneously reporting the whole shift as faithful.

### The readout answers to the gate

`PerceivedShift.faithful` delegates to `withinColorTolerance`, the color-accuracy gate's own
predicate, rather than repeating the comparison. When the shift is within tolerance the readout says
the surface reads as painted, and it says so on exactly the evidence the gate accepts. Delegating
instead of duplicating means the two cannot drift apart if the gate's rule ever moves.

This inherits the gate's stated limits. [[ADR-0156-luminance-calibration-convention]] promises the
raw-albedo round trip for the mid-range only, and the near-white and near-black shoulder and toe of
the tone-mapping operator are deferred (issue #512). A readout on a near-white paint may therefore
report a shift that is a known property of the operator rather than a property of the light. That is
documented behavior rather than a defect, and it is one more reason the readout reports what it
sampled instead of claiming the render is correct.

## Consequences

The readout is absent until a sample lands. Nothing renders in the inspector before the first click
in the 3D view, which keeps the finish sections unchanged in Storybook and leaves the committed story
baselines untouched. The context hook returns null without a provider for the same reason, a
deliberate departure from `useSurfaceSelection`, which throws.

A sample is a point observation and it does not follow the light. Changing the time of day or
orbiting the camera leaves the last sample on screen until the next click. That is the correct
reading of a measurement, but it will look stale to someone scrubbing the sun across an afternoon.
Re-sampling on environment change is a plausible follow-up and is deliberately out of this change.

The sample depends on the canvas being drawn at the moment it is read, so it is unavailable in the
WebGL2-only fallback path where the live 3D pane refuses to render at all (issue #476). Nothing new
breaks there. The readout is simply one more thing that pane does not offer yet.

The WebGPU and WebGL 2 backends are treated identically. Nothing in the sampling path is
backend-specific, because it reads the composited canvas rather than any renderer-internal surface.
That is also why it should survive the eventual WebGPU default without change.

Disposal is trivial by construction. The adapter holds one scratch 2D canvas sized to the patch and
no GPU resources, so it is collected with the reader and there is nothing to release.
