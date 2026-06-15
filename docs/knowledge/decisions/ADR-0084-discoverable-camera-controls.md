---
slug: decisions/ADR-0084-discoverable-camera-controls
title: 'ADR-0084: Discoverable three-dimensional camera controls'
type: decision
tags: [architecture, three-dimensional, camera, controls, discoverability, preview, ux]
related:
  [
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0083-three-dimensional-camera-presets,
    decisions/ADR-0075-three-dimensional-preview-camera-fit,
  ]
sourceFiles:
  [
    docs/specs/2026-06-15-discoverable-camera-controls.md,
    docs/plans/2026-06-15-discoverable-camera-controls.md,
    bridge/react/camera-controls-hint.tsx,
    bridge/react/webgpu-scene-view.tsx,
    e2e/tests/scene-camera-controls.spec.ts,
  ]
status: current
updated: 2026-06-15
---

# ADR-0084: Discoverable three-dimensional camera controls

## Status

Accepted. Issue #125, owner feedback that the three-dimensional camera controls are
not discoverable. It follows the camera navigation slice that added the controls
([[ADR-0064-three-dimensional-camera-navigation]]) and the preset buttons
([[ADR-0083-three-dimensional-camera-presets]]).

## Context

The preview moves the camera in several ways already: a drag orbits, a right drag
pans, the wheel zooms, walk mode reads the W, A, S, and D keys, and a toolbar button
resets the view. The mode buttons and the reset button are visible, but the canvas
gestures are not. A viewer who opens the preview sees a static model and no sign that
the canvas itself responds to a drag or a scroll, and the pane keeps the default
cursor, so nothing says the canvas is grabbable. The owner reported this as issue #125:
moving or rotating the camera is not obvious or immediate the way dragging the
two-dimensional plan is.

The question is how much to add. The controls work; what is missing is that they are
visible.

## Decision

Surface the existing controls without changing them. Two additions to the preview
pane.

First, a grab cursor on the pane: a grab cursor at rest and a grabbing cursor while a
drag is in progress, matching the affordance the plan view already uses for its pan
gesture. The pane tracks whether a pointer drag is underway and sets the cursor
accordingly. This is the immediate signal that the canvas is draggable.

Second, a controls hint: a small caption in a corner of the pane that lists the
controls for the active navigation mode. The mode-to-controls mapping is a pure
function in the bridge layer, so it is unit tested on its own, and the caption is a
small presentational component that renders the list and is tested through the DOM.
The caption takes no pointer events, so it never blocks a drag. The hint is keyed on
the navigation mode the pane already tracks, so it changes with the mode at no extra
state cost.

The hint text lives in the bridge layer next to the navigation mode type rather than
in core, because the control descriptions are facts about the rendering layer's input
handling, not about the domain model.

## Alternatives considered

- **An on-screen gizmo or view cube.** A draggable orientation widget would be more
  capable, but it is a new interaction surface with its own picking, hit areas, and
  visual design, which is a much larger change than making the existing controls
  visible. The hint and cursor are the smaller step; a gizmo can follow if they are
  not enough.
- **Change the default drag.** The issue compares the preview to the plan's
  drag-to-pan. Making the default three-dimensional drag pan rather than orbit would
  match the plan, but orbit is the more useful default for inspecting a model and the
  navigation slice settled on it. Surfacing the controls keeps the chosen behavior and
  removes the discoverability gap.
- **A dismissable or auto-hiding hint.** Hiding the hint after first use would reduce
  clutter, but it needs a piece of persisted view state. The persistent caption is the
  simpler first cut; a dismissal can be added later if the caption proves intrusive.

## Consequences

- The preview pane shows a grab cursor and a per-mode controls caption, so the camera
  controls are discoverable. This closes issue #125.
- No control behavior changes: the mouse buttons, the wheel, the walk keys, the reset
  button, and the presets all keep their behavior.
- The mode-to-controls mapping is a pure, unit-tested function, and the caption is a
  small DOM-tested component, so the discoverability text is verified without the
  hardware renderer; an end-to-end check covers the wiring in the pane.
- A later pass can add a richer affordance (a gizmo or a view cube) or an auto-hiding
  hint on top of this without unwinding it.
