---
slug: decisions/ADR-0126-marquee-crossing-and-set-operations
title: 'ADR-0126: Crossing marquee and additive selection set operations'
type: decision
tags: [architecture, editor, plan, selection, marquee, multi-select, geometry]
related:
  [
    decisions/ADR-0032-broad-then-narrow-hit-test-and-multi-select,
    decisions/ADR-0020-bridge-owned-selection-outside-undo,
    decisions/ADR-0040-clipboard-and-transforms,
    decisions/ADR-0070-two-dimensional-pan-and-default-interaction,
  ]
sourceFiles:
  [
    editor/plan/marquee.ts,
    editor/plan/marquee-selection.ts,
    editor/plan/select-gesture.ts,
    editor/plan/use-plan-selection.ts,
  ]
status: current
updated: 2026-08-30
---

# ADR-0126: Crossing marquee and additive selection set operations

## Status

Accepted, landed. Amended on 2026-08-30 for issue #605: the set operation now
locks when the marquee begins, not when the pointer lifts. The selection marquee
reads its drag direction and its modifier keys. A left-to-right drag keeps the
window (contained) rule; a right-to-left drag also grabs entities it merely
crosses. At the drag-threshold flip, Shift alone starts a replace marquee, Alt
alone starts a subtractive one, and Shift with Alt starts an additive one. The
modifiers held at release play no part. This builds on ADR-0032, which shipped
window-only marquee that replaced the selection and named both of these as work
for a later editing slice.

## Context

ADR-0032 left two follow-ons on the record. First, crossing selection: it noted
that a right-to-left drag grabbing partial overlaps is "a new predicate over the
same `queryBounds` candidates, not a new architecture." Second, the marquee
replaced the selection wholesale through `setSelection`, while shift-click was
the only additive path. Issue #201 asks for both: select by coverage or by
intersection, and add to or subtract from the selection with modifier keys.

The select tool already pans on a plain primary drag and starts a marquee only
when a modifier is held (ADR-0070), so the modifier that begins a marquee and the
modifier that decides the set operation overlap. The design had to keep a plain
drag panning while still reaching all three set operations and both geometry
rules.

## Decision

### Crossing geometry is a sibling predicate, not a new path

`editor/plan/marquee.ts` keeps `entitiesInRect` and adds `entitiesCrossingRect`
beside it. Both walk the same wall, room, opening, and dimension lists through
one shared `selectEntities` helper that takes a per-kind predicate bundle; only
the predicates differ. The crossing predicates are a Liang-Barsky segment clip
for walls and dimensions and a polygon-rectangle overlap for rooms and opening
footprints. The polygon test reports an overlap when any polygon edge crosses the
rectangle or when the rectangle sits entirely inside the polygon, so a room that
encloses the whole marquee counts as crossed. Both predicates share the inclusive
boundary rule the window selection already used, so an entity touching the
rectangle edge is selected.

### The pure gesture machine carries the rule and the operation

`editor/plan/select-gesture.ts` resolves the marquee on release into an effect
that carries a `mode` and an `operation`. The mode is `crossing` when the
release point lies left of the press origin and `window` otherwise, so direction
alone picks the geometry rule with no extra key. Since the 2026-08-30 amendment
the operation locks at the moment the gesture crosses the drag threshold and
becomes a marquee: Shift alone locks `replace`, Alt alone locks `subtract`, and
Shift with Alt locks `add`. The marquee state carries the locked operation and
the release handler reads it from the state, so the modifiers held at release
cannot change the outcome. The original design read the modifiers at release
(Shift added, Alt subtracted, neither replaced), which left replace reachable
only by releasing the modifiers before the pointer lifted and let a late slip of
the fingers change the operation mid-gesture. A marquee still begins on either
Shift or Alt, so an Alt drag opens a subtractive marquee without first holding
Shift, and the machine stays a pure function unit-tested in plain Node.

### A pure resolver folds the marquee into the selection

`editor/plan/marquee-selection.ts` adds `resolveMarqueeSelection`, which picks the
window or crossing entity list by mode and folds it into the current selection by
operation: replace swaps the set, add unions, subtract removes. It returns the
next id list for `setSelection`. Keeping this in a pure helper means the union and
difference logic is unit-tested rather than buried in the pointer glue.

### The hook wires the modifiers through and stays thin

`editor/plan/use-plan-selection.ts` forwards the live Alt flag into the gesture
sampler and, on release, calls `resolveMarqueeSelection` with the current
selection from the bridge store. The store keeps its existing surface; the hook
reads `getSelectedIds()` and writes `setSelection(...)`, so selection stays
bridge-owned and outside undo exactly as ADR-0020 and ADR-0032 require. No bridge
or core change was needed.

## Consequences

- The marquee covers both selection rules a vector editor expects, chosen by drag
  direction, with no new key to learn and no change to the live marquee overlay.
- A plain Shift marquee replaces the selection, so one gesture says "select
  exactly these" and a second Shift marquee restarts the selection rather than
  growing it. Add stays one gesture away on Shift with Alt, and Alt keeps
  subtracting. Under the original release-time rule a Shift marquee added, and
  replace was reachable only through the release-order trick; issue #605
  recorded that gap and the 2026-08-30 amendment closed it.
- The set operations live in a pure resolver and the rule and operation live in
  the pure gesture machine, so the pointer hook stays coverage-excluded glue and
  the behavior is exercised by unit tests plus a marquee multi-select end-to-end
  spec.
- Crossing and the set operations attach to the existing broad-phase candidates
  and the existing selection store, so a future quadtree or a new entity kind
  still lands behind the same query and predicate seams.

## Alternatives considered

- **A modifier rather than drag direction for crossing.** Rejected because the
  modifiers were already spent on the set operation and on starting the marquee,
  and direction-based crossing is the long-standing convention ADR-0032 named.
- **Keep the marquee replacing and add a separate additive gesture.** Rejected as
  more surface for less: folding the operation into the same release the marquee
  already resolves reuses the gesture machine and the broad-phase candidates.
- **Compute the union and difference inside the bridge selection store.** Rejected
  to keep the store a plain observable with a stable surface (ADR-0020). The
  resolver belongs in the plan layer beside the geometry it consumes.

## References

- ADR-0032 (window marquee and additive multi-select, which deferred crossing and
  named it a predicate over the same candidates).
- ADR-0020 (the bridge-owned selection store this reads and writes without
  changing its surface).
- ADR-0040 (the move-drag and transforms that act on the selection this marquee
  builds).
- ADR-0070 (the two-dimensional pan and default interaction that reserves the
  plain primary drag, forcing the marquee onto a modifier).
- Issue #201 (bounding-box multi-select and group drag-move).
