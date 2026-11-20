---
slug: decisions/ADR-0222-public-beta-scope-of-stairs-and-the-cutaway
title: 'ADR-0222: The public beta builds a straight stair, a level cut, and a floor view with the floors below'
type: decision
tags: [stairs, multi-floor, cutaway, 3d-preview, scene-graph, floors, public-beta, scope]
related:
  [
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
    decisions/ADR-0062-three-dimensional-floor-slabs-and-ceilings,
    decisions/ADR-0086-near-wall-transparency,
    decisions/ADR-0127-whole-building-3d-view,
    decisions/ADR-0178-schema-version-and-revision,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    core/model/types.ts,
    core/registries/element-types.ts,
    core/topology/stair-well.ts,
    core/scene/scene-graph-for-floor.ts,
    bridge/react/view-scene-graph.ts,
    editor/plan/draw-stair.ts,
    engine/scene/room-builder.ts,
  ]
status: current
updated: 2026-11-20
---

# ADR-0222: The public beta builds a straight stair, a level cut, and a floor view with the floors below

## Status

Current. The project owner decided the four points below on 2026-11-20, on issue #169. No build
work has started. This record amends the public beta deliverables and acceptance lines of the
design specification, section "Phase 5: Multi-floor + stairs", and each changed line cites this
record.

## Context

Phase 5 of the design specification is the public beta. Its deliverables asked for five stair run
types (straight, L-turn, U-turn, winder, and spiral), landings, and a "cutaway preview with
adjustable transparency on floors above". Section 3.2 describes the stair as a parametric entity
with treads, risers, runs, landings, railings, balusters, and newels.

Here is what the code holds on `main` at the time of this record:

- A stair is a footprint. `Stair` in `core/model/types.ts` holds a run type, a position, a width, a
  length, a rotation, and the two floors it connects. It holds no tread count, no riser height, and
  no railing.
- The plan draws a stair on its lower floor only (`editor/plan/draw-stair.ts`). The upper floor
  shows nothing.
- The registry holds the straight run only, and it names a `parametric-stair` builder
  (`core/registries/element-types.ts`) that `engine/` does not have.
- `core/topology/stair-well.ts` computes a stair well outline, but no code calls it, so the floor
  above stays closed.
- The 3D view has two scopes, "This floor" and "Whole building" (ADR-0127). In "This floor" only the
  active floor is drawn, so a stair that comes up from the floor below is missing. In "Whole
  building", each upper floor covers the floor below it. There is no cutaway.
- The floor thickness is a 250 mm placeholder (ADR-0062), and the model has no roof.

Transparency is expensive in this renderer. Six records already govern the near-wall fade
(ADR-0086, ADR-0087, ADR-0103, ADR-0140, ADR-0145, ADR-0218). Ghosted floors would have to sort correctly
against that fade and against shadows.

## Decision

### The cutaway is one general plane, level in the beta

The 3D view hides everything above a height. A slider sets the height, and a change of the active
floor moves it. The beta builds the clip as a general plane with caps on the walls it cuts, and in
the beta that plane is always level.

After the beta, the user can stand the same plane upright on a line drawn in the plan, to see
stairs, headroom, and floor heights in section. This is a new mode of the one plane, not a second
tool. Since the beta clip is already a general plane with caps, the upright mode adds a control in
the plan and should not need the clip rebuilt.

The beta has no adjustable transparency on the floors above.

### The floor view shows the active floor and the floors below

In the floor view, the active floor and every floor below it are drawn solid, and the floors above
are hidden, so a stair that arrives from below is in view. Today "This floor" draws the active floor
alone.

Which floors the camera frames in the floor view is not decided here. The first view of a project
frames what the view shows, so drawing the floors below may change what it frames. That stays open.

### The first stair is a straight run with a plain balustrade and newels

The beta stair is the straight run. It has treads, risers, stringers, a handrail, balusters, and
newels, all in plain forms, and the balustrade also guards the open edge of the stair well.

These come after the beta:

- period balustrade and newel types, such as turned balusters and box newels, as registry data;
- landings;
- the L-turn, U-turn, winder, and spiral runs.

New stair fields are optional in the stored format (ADR-0178), so a later run type or a landing
adds data and does not change what the beta stores.

### The stair cuts its own stair well, and the user can reshape it

A stair opens the floor above it over its footprint. The user can change the outline of that
opening, for a short stair well under low headroom or a wide open stair hall. The cut reaches the
upper floor slab, the ceiling below it, the plan of the upper floor, and the room area. A derived
outline that the user can replace follows the pattern that rooms use (ADR-0036), and the slab
builder already accepts holes (`engine/scene/room-builder.ts`), as ADR-0034 asks of a mesh builder.

## The design specification after this record

Section 3.2 stays the long-term model. A stair is still a parametric entity with landings,
railings, balusters, and newels. The beta builds part of that model, and the rest comes later on
the same entity.

The Phase 5 lines change as follows. Each now cites ADR-0222.

- "Stair entities": the straight run is in the beta. The L-turn, U-turn, winder, and spiral runs
  come after the beta.
- "Stair geometry": treads, risers, stringers, a handrail, balusters, and newels in plain forms.
  Landings and the period balustrade and newel types come after the beta.
- "Floor-by-floor view in 2D and 3D": the 3D floor view shows the floors below and hides the floors
  above.
- "Cutaway preview": the level cut on one general plane, with the upright mode after the beta. This
  replaces adjustable transparency on the floors above.
- "Vertical relationships": the stair cuts its stair well over its footprint, and the user can
  change the outline.
- The acceptance line for the 4-story old house now asks for straight-run stairs between all
  levels. The acceptance line for the cutaway now names the level cut and the floor view.

## Open points

These were not decided and stay open for the design round on #169:

- What happens to a wall that crosses a stair well.
- The shadow rules for the cut plane and its caps.
- The stair well rule under a sloped ceiling, such as a stair into an attic. This waits for the
  design round on roofs and sloped ceilings.
- Which floors the camera frames in the floor view, now that the floors below are drawn.

## Consequences

- One value in the view state, the cut height, serves both the cutaway and the floor view, since the
  floor view is a level cut at the top of the active floor.
- The beta avoids transparent floors and the sorting work they would need against the wall fade.
- An upright section shows two placeholders today, the 250 mm floor thickness and the missing roof.
  Moving the upright mode after the beta keeps those placeholders out of the beta view.
- A period stair hall in the beta has a plain balustrade. Turned balusters and box newels come with
  the later registry types.
- The upright mode, the period balustrade and newel types, and the landings with the other run
  types each need their own issue in the 1.0 milestone.

## Alternatives considered

For the cutaway, the options were an upright section plane alone, and one plane that the user turns
level or upright with both in the beta. Both are larger builds, and the upright view still shows
the placeholder floor thickness. The decision keeps the general plane, so the upright mode can come
later without rework.

For the floor view, the options were the active floor alone, the floors below solid with the floors
above ghosted, and every other floor ghosted. The active floor alone leaves a stair from below out
of view and a stair well that opens onto nothing. Both ghosted options carry the transparency cost
described above, and from above, ghosted floors cover the active floor.

For the first stair, the options were treads, risers, and stringers alone, or the full period
balustrade types in the beta. A stair with no guard looks wrong next to an open stair well. Period
types need shape data and a review for each type.

For the stair well, the options were an opening fixed to the stair footprint, or a floor opening
the user draws as its own element. A fixed opening cannot draw the short stair wells and wide stair
halls common in old houses. A drawn opening leaves a new stair rising into a closed floor until the
user draws it.

## References

- Design specification `docs/specs/2026-06-01-vernacular-design.md`, section 3.2 (the stair entity)
  and section "Phase 5: Multi-floor + stairs".
- Issue #169.
- ADR-0127 (the two 3D view scopes), ADR-0062 (the placeholder floor thickness), ADR-0036 (a derived
  outline the user can replace), ADR-0034 (a hole as a geometry modifier), ADR-0178 (optional
  stored fields), and ADR-0086 (the near-wall fade).
