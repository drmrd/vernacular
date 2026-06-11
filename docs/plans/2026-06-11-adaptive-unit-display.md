# Adaptive Unit Display Implementation Plan

> **For agentic workers:** role-separated red-green-blue subagents from the main
> thread. Each cycle is `test:` -> `feat:`/`fix:` -> `refactor:`. No journey-coverage
> flip (adaptive units is not a gated capability).

**Goal:** Stop showing millimeters at room and building scale. Add an adaptive length
formatter that, in metric, selects millimeters, centimeters, or meters by magnitude
with category-appropriate precision, and in imperial shows feet and inches. Apply it
at the value-display points: the entity proxy labels, the inspectors, and the
dimension labels.

**Architecture:** A pure `core` function `formatAdaptiveLength(mm, preferences)` picks
the metric form by magnitude and delegates to the existing `formatLength`; imperial
uses feet-and-inches with the user's imperial precision (so adaptive imperial equals
today's default imperial output, and only metric displays change). Editor call sites
swap `formatLength(mm, lengthFormatOptions(preferences))` for
`formatAdaptiveLength(mm, preferences)`. The ruler (which needs one consistent unit
for the whole axis, not a per-tick choice) is a documented fast-follow.

**Tech Stack:** TypeScript, React, Vitest + Testing Library.

---

## The adaptive rules (locked)

`formatAdaptiveLength(mm: Millimeters, preferences: UnitPreferences): string`:

- **imperial:** `formatLength(mm, { system: 'imperial', form: 'feet-and-inches',
precision: preferences.imperialLengthPrecision })`. (Equals today's default imperial
  output, so imperial test expectations do not change.)
- **metric**, by `Math.abs(mm)`:
  - `>= 1000` -> meters, `{ kind: 'decimal-places', places: 2 }` (e.g. 3000 -> "3.00 m").
  - `>= 100` -> centimeters, `{ kind: 'decimal-places', places: 1 }` (e.g. 900 -> "90.0 cm").
  - else -> millimeters, `{ kind: 'decimal-places', places: 0 }` (e.g. 80 -> "80 mm").

## Call sites (editor)

Convert these `formatLength(value, lengthFormatOptions(preferences))` calls to
`formatAdaptiveLength(value, preferences)`:

- `editor/plan/overlay-label.ts` (3 calls: wall, opening width, dimension)
- `editor/plan/dimension-inspector.tsx`
- `editor/plan/opening-inspector.tsx`
- `editor/plan/wall-thickness-editor.tsx`
- `editor/plan/dimension-chip.ts`
- `editor/plan/draw-dimension.ts`

NOT `editor/plan/ruler.ts` (deferred; see below).

---

## Cycle 1: the adaptive length formatter (core)

**Files:** create `core/units/format-adaptive-length.ts`, test
`core/units/format-adaptive-length.test.ts`; export from `core/index.ts`.

RED (`format-adaptive-length.test.ts`): import `formatAdaptiveLength` from
'./format-adaptive-length' and `DEFAULT_METRIC_PREFERENCES`/`DEFAULT_IMPERIAL_PREFERENCES`
from './preferences'. Assert:

- metric (DEFAULT_METRIC_PREFERENCES): 3000 -> "3.00 m"; 2500 -> "2.50 m"; 900 ->
  "90.0 cm"; 150 -> "15.0 cm"; 80 -> "80 mm"; 0 -> "0 mm".
- imperial (DEFAULT_IMPERIAL_PREFERENCES): `formatAdaptiveLength(1219, prefs)` equals
  `formatLength(1219, { system: 'imperial', form: 'feet-and-inches', precision:
prefs.imperialLengthPrecision })` (import formatLength to compute the expected; or
  just assert it contains a foot mark and is not the metric string). Prefer the
  equals-formatLength assertion so the contract is explicit.
- negatives use magnitude for the form choice: -3000 -> "-3.00 m".

GREEN (`format-adaptive-length.ts`): `export function formatAdaptiveLength(mm:
Millimeters, preferences: UnitPreferences): string`. Import `formatLength` from
'./format-length', types from './length-units' and './preferences'. Imperial: delegate
as above. Metric: choose the form/precision per the locked rules and call
`formatLength(mm, { system: 'metric', form, precision })`. Name the threshold
constants (e.g. `METERS_THRESHOLD_MM = 1000`, `CENTIMETERS_THRESHOLD_MM = 100`) and the
places (the no-magic-numbers rule ignores [-1,0,1,2,100]; 1000 and the places need
names or are in the ignore set). Export `formatAdaptiveLength` from `core/index.ts`
beside `formatLength`.

## Cycle 2: adaptive entity proxy labels

**Files:** modify `editor/plan/overlay-label.ts`; tests
`editor/plan/overlay-label.test.ts` and any sibling that asserts a metric label string
through the overlay labels (`editor/plan/overlay-announce.test.ts`,
`editor/plan/entity-proxy.test.tsx`).

RED (test-author): update the metric assertions in `overlay-label.test.ts` (and the
two siblings if they assert metric length strings) to the adaptive output: e.g.
'Wall, 3000 mm' -> 'Wall, 3.00 m'; 'Single Swing Door, 900 mm wide' -> 'Single Swing
Door, 90.0 cm wide'; 'Dimension, 2500 mm' -> 'Dimension, 2.50 m'. Leave the imperial
assertions unchanged (they still match). These now fail because overlay-label still
uses the fixed millimeter form.

GREEN (implementer): in `overlay-label.ts`, replace the three `formatLength(...,
lengthFormatOptions(preferences))` calls with `formatAdaptiveLength(..., preferences)`
(import `formatAdaptiveLength` from '../../core'; drop the now-unused
`lengthFormatOptions`/`formatLength` imports if nothing else uses them).

## Cycle 3: adaptive inspectors and dimension labels

**Files:** modify `editor/plan/dimension-inspector.tsx`,
`editor/plan/opening-inspector.tsx`, `editor/plan/wall-thickness-editor.tsx`,
`editor/plan/dimension-chip.ts`, `editor/plan/draw-dimension.ts`; update their tests'
metric assertions.

RED (test-author): update the metric length assertions in
`dimension-inspector.test.tsx`, `opening-inspector.test.tsx`,
`wall-thickness-editor.test.tsx`, `dimension-chip.test.ts`, and
`draw-dimension.test.ts` to the adaptive output (recompute each metric value per the
locked rules; imperial assertions unchanged). They fail until the call sites switch.

GREEN (implementer): swap the `formatLength(value, lengthFormatOptions(preferences))`
calls in those five files for `formatAdaptiveLength(value, preferences)` (adjust
imports). Keep the ruler untouched.

---

## Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build` green.
- `pnpm rgb:audit --range "origin/main..HEAD"` clean.
- No journey-coverage change; integration:audit stays 5 required / 6 pending.
- Metric lengths read in m/cm/mm by magnitude in the proxy labels, inspectors, and
  dimension labels; imperial reads feet-and-inches unchanged.

## Deferred (fast-follow)

The ruler axis labels (`editor/plan/ruler.ts`). A per-tick adaptive choice would mix
units along one axis ("0 mm" next to "60.0 cm"); the ruler needs to pick one unit for
the whole axis from its grid spacing. That is a separate change.
