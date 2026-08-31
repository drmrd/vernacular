---
slug: decisions/ADR-0169-click-selection-default-on
title: 'ADR-0169: Click selection is on by default in the orbit view'
type: decision
tags: [architecture, three-dimensional, selection, defaults, bridge]
related:
  [
    decisions/ADR-0064-three-dimensional-camera-navigation,
    decisions/ADR-0083-three-dimensional-camera-presets,
  ]
sourceFiles:
  [
    bridge/react/use-scene-navigation.ts,
    bridge/react/scene-selection-gate.ts,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/camera-controls-hint.tsx,
  ]
status: current
updated: 2026-08-30
---

# ADR-0169: Click selection is on by default in the orbit view

## Status

Accepted, landed with issue #604.

## Context

Clicking a wall or room in the 3D orbit view did nothing until the user found
the Select toggle in the navigation toolbar, because `useSceneNavigation` seeded
`selectionEnabled` to `false` on every mount. The toggle sat fourth in a cluster
of six controls, the on-canvas hint never mentioned it, and the keyboard proxy
path was never gated at all, so keyboard users could select in 3D while mouse
users could not. The opt-in gate had grown out of issue #226, which asked only
that walk mode not select; the mode rule in `scene-selection-gate.ts` already
covers that case on its own. No ADR recorded a reason for the extra opt-in, and
the walkthrough for the chrome and engine refinements campaign found that a
first-time user reads the silent click as "the 3D view is not interactive". The
perceived-color readout and the finish inspector both start from a click in 3D,
so the old default hid two of the newest features.

## Decision

`useSceneNavigation` seeds `selectionEnabled` to `true`. The toggle stays in the
toolbar as an opt-out for users who want an inert canvas while orbiting, and
`TOOLBAR_DEFAULTS` matches the live default so standalone and story renders
agree with the app. The walk-mode gate in `scene-selection-gate.ts` is untouched
and still stands selection down while walking. The orbit hint now ends with
"Click to select", stored in the same per-mode hint data as the other lines so
the pure `cameraControlsHint` function stays the single source of truth. The
walk hint does not name the click, because walk mode gates selection off. The
scene-selection end-to-end spec is re-pinned to the new default: a first click
selects with no setup, and switching the toggle off makes the click inert.

## Consequences

- A first click in the orbit view selects, which is what every tested user
  expected. The two click-driven inspectors are reachable without a toolbar
  hunt.
- Users who prefer an inert canvas keep the opt-out, but the preference does not
  persist across sessions. If that annoys anyone in practice, persistence is a
  small follow-up on the session-state work tracked in issue #603.
- The keyboard proxy path and the pointer path now agree on the default, which
  removes the asymmetry between keyboard and mouse users.
