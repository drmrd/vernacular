---
slug: decisions/ADR-0146-environment-panel-and-session-contract
title: 'ADR-0146: Environment panel and the session-state contract behind it'
type: decision
tags: [architecture, editor, bridge, environment, lighting, session-state, schema, 3d-preview]
related:
  [
    decisions/ADR-0143-environment-model-foundations,
    decisions/ADR-0144-solar-lighting-provider-and-sky,
    decisions/ADR-0147-per-mode-tone-mapping,
    decisions/ADR-0065-three-dimensional-lighting-and-color-temperature,
    decisions/ADR-0193-sample-daylight-for-a-project-with-no-site-location,
    decisions/ADR-0205-opening-time-chosen-for-the-house,
  ]
sourceFiles:
  [
    core/environment/environment-state.ts,
    core/environment/color-check.ts,
    core/environment/timezone-offset.ts,
    bridge/environment/environment-session-store.ts,
    bridge/environment/environment-session-store.test.ts,
    bridge/react/environment-session-context.ts,
    editor/environment/environment-panel.tsx,
    bridge/react/environment-controls.tsx,
    editor/environment/environment-scenes.tsx,
    editor/shell/tool-rail.tsx,
    editor/shell/shell-providers.tsx,
    editor/shell/shell-providers-opening-light.test.tsx,
  ]
status: current
updated: 2026-11-22
---

# ADR-0146: Environment panel and the session-state contract behind it

## Status

Accepted, landed in slice 1b of the realistic-environmental-lighting epic. This record covers
the Environment panel in the tool rail, the session contract it writes, the schema-16 weather
field, and the deviations from the written plan that execution surfaced. It extends
[[ADR-0143-environment-model-foundations]] (the persisted environment model),
[[ADR-0144-solar-lighting-provider-and-sky]] (whose missing-location and cloud-cover forward
references resolve here), and [[ADR-0065-three-dimensional-lighting-and-color-temperature]]
(session-state lighting controls).

## Context

Slice 1a shipped the solar provider with stopgap controls: a realistic-lighting button buried in
the scene toolbar's display options and an observation scrubber in the toolbar's environment
group, both backed by per-view `useState` inside the scene view. The realistic inputs needed a
user-facing home that the spec assigns to the editor layer, and the toolbar state could not
serve a panel living in a different React subtree.

## Decision

### `EnvironmentState` is the panel-level contract

One pure-core value object, `{ mode, observedAt, cloudCover, colorCheck }`, carries everything
the Environment panel owns. Site location and timezone stay on `Site` and are read live; the
bridge composes the two when it computes `EnvironmentLighting`, so the persisted "where" cannot
drift from a session copy. Color temperature stays outside the contract: it is the schematic
rig's tint (ADR-0065) and remains view-local.

### The session store is bridge-owned and deliberately simple

`createEnvironmentSessionStore()` plus `EnvironmentSessionProvider` and `useEnvironmentSession()`
mirror the surface-selection idiom; `EditorShell` mounts the provider once, so the rail panel
and the scene view read and write the same state. "Per-view" today means the one 3D preview
pane; if multiple panes ever exist the store moves per-pane. The state never touches the model
or undo (spec locked decision 3).

Two conscious wrinkles in the idiom. First, the bare name `useEnvironmentSession` goes to the
combined value-plus-setter hook the panel and viewport consume, so the raw-store accessor takes
the suffixed name `useEnvironmentSessionStore`; the surface-selection precedent gives the bare
name to the store accessor, but here that name was the better fit for the hook everything
actually calls. The store accessor is still exported for parity even though only the combined
hook has outside consumers today. Second, `setEnvironment` is a whole-value replace with
last-writer-wins semantics. Review flagged that a second concurrent writer could clobber a
stale snapshot; we kept the simple contract because every writer is a controlled component that
re-renders with fresh state before its next write, and no debounced or asynchronous writer
exists in this slice. A patch-style updater is the known upgrade path if one ever lands.

### The panel lives in the tool rail; the toolbar slims to schematic-only

The panel is a labeled rail section directly after Site, implemented in `editor/environment/`
as a pure controlled component. Three reasons: the spec's layering contract puts the panel in
`editor/`, which the bridge-layer toolbar cannot host (it cannot import the design system); the
rail is where named, structured panels live while the toolbar is a one-row strip at its density
limit; and the rail is visible in every view mode, so the panel drives the 3D pane live in
split view and sits beside the SiteEditor its notices point at. The observation scrubber and
the realistic toggle left the toolbar, which keeps only the color-temperature slider. The rail
itself moved to `editor/shell/tool-rail.tsx` when the shell file outgrew its size budget.

### A missing location or timezone degrades with an explanation

Realistic mode without a site location falls back to the schematic provider (ADR-0144), and the
panel now explains that with a notice pointing at the Site panel. A site with coordinates but
no timezone gets a second notice and a behavioral fallback: `utcOffsetMinutesFor` accepts an
optional longitude and estimates the offset as `round(longitude / 15) * 60`, one hour per
fifteen degrees, so sun angles stay roughly right instead of silently assuming UTC. The
recognized-timezone path is unchanged and always wins.

### The color check neutralizes tint, not geometry

`colorCheckLighting` replaces the computed sun and sky colors with `NEUTRAL_REFERENCE_WHITE`
while passing the sun direction and `sunIntensity` through, so shadows and the day/night fade
still read while every surface is lit white-balanced. In schematic mode the same flag pins the
rig tint to the same white. One boolean, one meaning in both modes; the tone-mapping operator
also forces hue-preserving Neutral while the check is on ([[ADR-0147-per-mode-tone-mapping]]).
The plan predates the slice's earlier interface change and said a `sunUp` flag passes through;
`sunUp` no longer exists, and the continuous `sunIntensity` scalar passes through instead.

### `WeatherConditions.cloudCover` lands at schema version 16

The dial's value round-trips through saved scenes, and the free-text `summary` cannot carry a
number cleanly. The optional field required a schema bump with a passthrough migration because
`WeatherConditions` rejects unknown properties. `summary` stays for human labels.

### Scene save, apply, and remove ship; rename waits

The panel saves the current "when and weather" under a typed, non-blank name, applies a saved
scene, and removes one, all through the slice-0 commands via `dispatch`, which keeps add and
remove undoable. Applying a scene sets `observedAt` and `cloudCover` and leaves `mode` and
`colorCheck` alone, because a scene persists conditions, not a viewing mode. Rename stays
command-only, tracked as a follow-up issue.

## Consequences

- The panel-to-provider path is fully wired: panel writes `EnvironmentState`, the shared store
  notifies the scene view, `useSolarLightingUpdate` composes `Site` with the state (memoizing
  the UTC offset on timezone and date), and the provider applies the result.
- ADR-0144's forward references (missing-location UX, the pinned clear sky) are resolved; its
  timezone-resolution section now has the longitude fallback layered on top.
- The toolbar-affected story and scene baselines, the shell/rail baselines, and the two new
  canonical scene baselines (`color-check`, `overcast-noon`) all regenerate on the CI hardware
  tier.
- Rename-in-panel for saved scenes is deferred with a tracking issue; the sky image-based
  lighting stage stays open under its own issue and nothing here touches `scene.environment`.

## References

- Realistic-environmental-lighting spec, slice 1b acceptance
  (`docs/specs/2026-07-01-realistic-environmental-lighting.md`).
- Implementation plan (`docs/plans/2026-07-03-realistic-lighting-slice-1b-environment-panel.md`).
- [[ADR-0143-environment-model-foundations]], [[ADR-0144-solar-lighting-provider-and-sky]],
  [[ADR-0147-per-mode-tone-mapping]], [[ADR-0065-three-dimensional-lighting-and-color-temperature]].

## Update (2026-08-17): mode-inert controls now say so

A UX audit found both halves of the mode split presenting live controls the
active mode ignored: in the default schematic mode the panel's observation
date, time-of-day, and cloud-cover inputs scrubbed a sun that never moved, and
under realistic lighting or the color check the toolbar's color-temperature
slider kept a live Kelvin readout that the solar provider discarded.

Both sides now disable the controls the current mode does not read and explain
why in a short status note, following this record's existing missing-location
notice pattern. The contract itself is unchanged: the panel still owns the
shared session and the toolbar still keeps only the color-temperature slider,
which now also receives the effective lighting mode.

## Amendment 2026-11-16: the sample daylight notice replaces the missing-location notice

The first sentence of "A missing location or timezone degrades with an explanation" no longer
holds. Realistic mode without a site location renders daylight at a sample site, not the schematic
rig ([[ADR-0193-sample-daylight-for-a-project-with-no-site-location]]). So the panel no longer says
"Realistic lighting needs the site location". In realistic mode, while `daylightSampleOf(site)` is
not `'none'`, it shows this notice instead:

> Sample daylight. Set the location and north in the Site panel for true sun angles.

That is every site without a location, also one with a stored north bearing. The notice keeps the
pattern of this record, a `role="status"` paragraph that points at the Site panel. The timezone
notice and the longitude estimate are unchanged: a located site with no timezone still gets them.
Schematic mode still shows its own notice.

The default instant of the session contract moved too. `DEFAULT_ENVIRONMENT_STATE.observedAt` now
comes from `openingInstant({ site: undefined })`, which is 20 March 2026 at 10:30, where it used to
be 21 June at noon. ADR-0193 records that seam.

The section on the color check names a retired field. `EnvironmentLighting.sunIntensity` is now
`sunLevel`, the sun light's actual level and not a fraction
([[ADR-0192-daylight-calibrated-from-three-targets-with-a-fixed-white-point]]). The check also no
longer passes it through: `colorCheckLighting` sets `sunLevel` to `COLOR_CHECK_SUN_LEVEL`, 1.6,
while the sun is above the horizon and to 0 below it
([[ADR-0156-luminance-calibration-convention]]). The check still keeps the sun's direction, so
shadows read as before.

## Amendment (2026-11-19): the session light is seeded for each project

The environment store no longer starts from one constant for every project
([[ADR-0205-opening-time-chosen-for-the-house]]). `createEnvironmentSessionStore` takes an optional
start state, and with none it starts from `DEFAULT_ENVIRONMENT_STATE` as before.
`SessionStateProviders` in `editor/shell/shell-providers.tsx` creates the store once, in a state
initializer, from `openingEnvironmentFor(site, sceneGraph)`. That is the instant and the cloud
cover of `openingConditions` for the project's site and front, with the default mode and color
check. The shell remounts for each new session, so each opened project starts from its own light.

The contract of this record holds. The state stays window state and never touches the document or
undo. The panel still owns it. A later edit of the site does not move the light on screen; only the
controls do. That is the recommended answer to open question 2 of the first-view specification,
which the owner has not taken yet ([[ADR-0205-opening-time-chosen-for-the-house]]).

## Amendment (2026-11-22): the store is seeded from the stored light, and the rail gains a control

The start state of the environment store now comes from the stored opening light when the project
has a well-formed one ([[ADR-0205-opening-time-chosen-for-the-house]], the extension of
2026-11-22). `SessionStateProviders` passes the `openingLight` of the project to
`openingEnvironmentFor(site, sceneGraph, stored)`, and a stored light wins over the time chosen for
the house. The seed still happens once for each opened project.

The Environment section of the tool rail gains the opening light control
(`editor/environment/opening-light-control.tsx`). It sits between the Environment panel and the
saved scenes. The panel's contract in this record did not change. The panel now shares the clock format with the control, and its date guard refuses dates that do not exist. The state still
never touches the document or undo. Only the button "Use this light when the project opens"
writes, through one command, and the project then holds a copy of the time and the cloud cover.
