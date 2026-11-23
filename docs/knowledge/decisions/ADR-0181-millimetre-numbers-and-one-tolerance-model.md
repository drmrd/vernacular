---
slug: decisions/ADR-0181-millimetre-numbers-and-one-tolerance-model
title: 'ADR-0181: Lengths are millimetre numbers under one tolerance model'
type: decision
tags: [geometry, kernel, units, tolerance, numeric-entry, format]
related:
  [
    decisions/ADR-0034-future-direction-extensibility-seams,
    decisions/ADR-0178-schema-version-and-revision,
    decisions/ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back,
  ]
sourceFiles: [core/geometry/segment.ts, core/topology/rooms.ts, core/topology/wall-graph.ts]
status: current
updated: 2026-11-23
---

# ADR-0181: Lengths are millimetre numbers under one tolerance model

## Status

Current. The owner chose this on 2026-11-14 and approved the architecture refactor round
specification the same day. It answers #496. The tolerance module and the formatter changes arrive
with the kernel stage of that round.

> Amended by [[ADR-0199-derived-tolerances-exact-junctions-and-lengths-that-read-back]] on
> 2026-11-23. ADR-0199 gives and derives the values this record left to the kernel specification:
> the length tolerance is 0.001 mm, the angle tolerance is 1e-8 radians, derived coordinates are
> rounded to a grid of 1e-6 mm, and the margins hold within 1 km of the plan origin. The 1 mm join
> moves from the derivation to pointer input, and a typed value is never moved.

## Context

Issue #496 asks which value is authoritative for a length: the millimetre number the design
specification stores, or the exact value the user typed, such as a fraction of an inch. The concern
behind it is that a typed value should read back unchanged after a save and a reload.

Geometry kernels store coordinates as 64-bit floating-point numbers in one unit and pair them with
explicit tolerances. Exact arithmetic is used for yes-or-no tests and not for stored data. The open
exchange standards for building models carry real numbers with a declared unit and a declared
precision. Applications differ above the kernel: architectural tools keep only the number and format
it for display, while parametric tools also keep the typed expression for named parameters.

Three facts settle the question for Vernacular.

- A 64-bit millimetre value holds a typed inch fraction to about 1e-12 mm at building scale. Formatting it back
  yields the same fraction.
- What actually threatens a typed value is tolerance. "The same point" means 1 mm, 1e-6, 1e-9, or
  exact equality depending on the module, and a 1 mm merge can move a wall end by about 1/25 inch.
- A wall stores two end points and no length. A typed length would be a note that any later edit
  invalidates, and a wall drawn at an angle has irrational end coordinates whatever is stored.

## Decision

1. Lengths are 64-bit numbers in millimetres, in the kernel and in the file format.
2. One module defines the geometric tolerances: when two points coincide and when two directions
   are parallel. No other module carries its own epsilon.
3. A typed entry is applied exactly and takes precedence over snapping.
4. The formatter shows an exact fraction or decimal when the stored value is one within tolerance,
   and marks a rounded value as approximate.
5. The format may later carry an optional record of the unit a value was entered in. That record is
   never authoritative. The numeric-entry design decides whether the editor uses it, and this round
   does not build it.

The tolerance values are derived in the kernel specification. They must sit far below the smallest
display step and far above floating-point rounding at building scale.

## Consequences

- Issue #496 can close. Exact-rational storage is rejected.
- A property test pins the guarantee: every inch fraction down to 1/64 and every metric value down
  to 0.1 mm, typed in the wall tool, reads back the same after save and reload.
- Driving dimensions, where a typed length becomes a rule the geometry keeps, stay possible. They
  need a constraint solver and their own design.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.4.
- Issue #496.
