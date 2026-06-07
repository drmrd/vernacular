---
slug: decisions/ADR-0027-units-module-targets-millimeter-storage
title: "ADR-0027: core/units/ display conversion targets the model's millimeter storage (SI-meters reconciliation deferred)"
type: decision
tags: [architecture, core, units, measurement, conversion, formatting, parsing, millimeters]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0026-room-derivation-planar-face-enumeration,
    decisions/ADR-0035-wall-editing-endpoint-move-and-thickness,
    decisions/ADR-0036-room-metadata-overrides-and-labels,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-04-units-and-measurement.md,
    core/model/types.ts,
    core/units/length-units.ts,
    core/units/precision.ts,
    core/units/preferences.ts,
    core/units/format-length.ts,
    core/units/parse-length.ts,
    core/units/index.ts,
  ]
status: current
updated: 2026-06-04
---

# ADR-0027: core/units/ display conversion targets the model's millimeter storage (SI-meters reconciliation deferred)

## Status

Accepted (2026-06-04). Implemented and unit-tested in `core/units/`: length-unit
conversion factors and functions (`length-units.ts`), display precision and
fraction rounding (`precision.ts`), per-system preferences (`preferences.ts`),
display formatting (`format-length.ts`), tolerant input parsing
(`parse-length.ts`), and a round-trip guarantee test (`round-trip.test.ts`). The
module is barrel-exported from `core/units/index.ts`. This is pure-domain work: it
lives in `core/`, so it imports no React, no Three.js, and no DOM (ADR-0001).

This ADR documents a deliberate divergence between the design specification and the
committed model. No `docs/specs/` change accompanies this slice; reconciling the
two is a separate decision recorded in its own ADR (see Consequences).

## Context

The design specification, section 7.3, states that internal storage is SI: meters,
square meters, and cubic meters. The committed model in `core/model/types.ts`
instead stores real-valued **millimeters**: `Point.x` and `Point.y`,
`Wall.thickness`, `Floor.elevation`, and `Floor.defaultCeilingHeight` are all
documented as millimeters, and the model factory constants follow the same unit
(for example the default ceiling height and default wall thickness are expressed in
millimeters). The concurrent topology slice (ADR-0026) and the storage slice both
build directly on that millimeter representation; their geometry, areas, and
persisted values are all in millimeters.

The Units and measurement slice needed a single canonical unit to:

- format for display (a metric or imperial string for a stored length),
- parse tolerant user input back into (free-form feet-and-inches, decimal feet,
  metric strings),
- and guarantee that the format-then-parse round trip introduces no drift against
  the stored value.

"No drift against the stored value" is only meaningful if the module's canonical
unit is the unit the value is actually stored in. That forced a choice: pin the
units module to the specification's meters, or to the model's millimeters.

## Decision

Build `core/units/` against the established **millimeter** representation.

- The canonical length value is real-valued millimeters, exposed as a documented
  type alias `Millimeters = number` (`core/units/length-units.ts`). It is a plain
  alias, not a branded type, because `core/model` uses plain `number` for the same
  quantities and this slice may not modify those consumers; a branded type would
  force a cast at every existing model boundary.
- Inch and foot conversions use integer-scaled arithmetic so exact values stay
  exact. `inchesToMillimeters` computes `inches * 254 / 10` and `feetToMillimeters`
  computes `feet * 3048 / 10` (the factors 25.4 and 304.8 expressed as integer
  fractions), so integer inputs produce exact terminating-decimal results without
  IEEE-754 noise.
- The metric factors (10, 1000) are exact integers, but decimal inputs such as
  2.03 m are not exactly representable, so metric conversions snap the product to a
  fixed number of significant digits to remove sub-ULP noise without rounding away
  genuine user precision.
- The model is **not** migrated to meters in this slice.

## Why this approach

- A units module should pin to whatever the persistence layer actually stores, so
  that "no drift against the stored value" is a guarantee about the real data, not
  about a hypothetical second representation.
- Introducing a second canonical unit in meters would add a conversion seam with no
  current consumer (nothing stores or reads meters today) and a fresh source of
  floating-point drift on every meters-to-millimeters hop.
- Because 1 inch = 25.4 mm and 1 foot = 304.8 mm exactly, imperial display values
  round-trip exactly against millimeters when conversion uses integer-scaled
  arithmetic. Pinning to meters would not improve and could degrade that guarantee.

## Consequences

- The design specification's "SI meters" wording (section 7.3) and the model's
  millimeter storage now diverge in documentation. This is a known, recorded
  divergence, not an oversight.
- Reconciling them is a separate, cross-cutting decision for the maintainer, to be
  made outside this slice and recorded in its own ADR. The options are: amend the
  specification to bless millimeters as the internal unit, migrate the model to
  meters, or otherwise formalize the chosen unit. The project rule forbids modifying
  the design specification without a corresponding ADR, so this slice does neither.
- The units module is consumer-ready against the millimeter-based model used by the
  other Phase 1 slices (topology, storage). Downstream consumers can format and
  parse lengths today without waiting on the reconciliation.

## Related and deferred

The following are out of scope for this slice and are documented in the slice plan
`docs/plans/2026-06-04-units-and-measurement.md`:

- area and volume units (square and cubic measures),
- angle and bearing units,
- localized unit symbols and locale-aware number formatting
  (internationalization, design specification section 7.2),
- a branded `Millimeters` type (deferred so the alias stays assignment-compatible
  with the plain `number` the model uses).

## References

- Design specification, section 7.3 (SI internal storage) and section 7.2
  (internationalization and locale-aware formatting).
- Slice plan: `docs/plans/2026-06-04-units-and-measurement.md`.
- `core/model/types.ts` (millimeter storage for `Point`, `Wall.thickness`,
  `Floor.elevation`, `Floor.defaultCeilingHeight`).
- ADR-0001 (six-layer architecture; this is pure `core/` work with no React,
  Three.js, or DOM).
- ADR-0026 (room derivation; computes areas in squared millimeters and notes that
  human-readable formatting needs this slice's unit formatters).
- ADR-0035 (the inline wall-thickness editor, the first consumer of `formatLength`
  and `parseLength`: it formats the stored millimetre thickness and parses the
  edited string back to millimetres, dispatching nothing on an unparseable entry).
