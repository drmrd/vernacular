# Units and Measurement Implementation Plan

> **For agentic workers:** This plan is executed with the project's red-green-blue
> TDD workflow (see `CLAUDE.md` and `.claude/rules.md`), not the generic
> single-engineer flow. Each task is one RGB cycle: `/test-first <behavior>` (RED,
> isolated `test-author`), `/implement` (GREEN, isolated `implementer`),
> `/clean-code-review` (BLUE review), `/refactor` (BLUE refactor, ends with a
> `refactor:` commit even when empty). The test-author and implementer never share
> files; both read this plan as the shared behavior specification, so the public API
> surface and example tables below are the contract that keeps them converging.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-TypeScript `core/units/` module that converts between the
stored millimeter representation and human display strings (imperial and metric,
multiple forms), parses tolerant user input back to millimeters, and guarantees no
round-trip drift between the parser and formatter.

**Architecture:** Canonical length values are real-valued millimeters, matching
`core/model` (see the "Canonical unit" decision below). Conversions are pure
integer-scaled functions to avoid floating-point drift. Formatting and parsing are
separate modules over a shared precision model. The module imports nothing above
`core/` and only depends on `core/model/types` for the existing `UnitSystem` enum.

**Tech Stack:** TypeScript, Vitest. No new runtime or dev dependencies (the 15-day
cooldown plus the `core/units/`-only scope rule it out); the round-trip invariant is
tested with a deterministic, seeded generative loop rather than a property-testing
library.

---

## Decisions and deferrals

### Canonical unit: millimeters (not SI meters)

Design specification section 7.3 states internal storage is SI (meters, square
meters, cubic meters). The committed model (`core/model/types.ts`) instead stores
real-valued **millimeters** (`Point`, `Wall.thickness`, `Floor.elevation`,
`Floor.defaultCeilingHeight`, and the `DEFAULT_*_MM` factory constants), and the
concurrent topology and storage slices build on that representation.

This slice builds display conversion and parsing against the established millimeter
representation and does **not** migrate the model. A units module should pin to the
unit the persistence layer actually stores so "no drift against the stored value" is
a meaningful guarantee; introducing a second canonical in meters would add a
conversion seam with no consumer and a fresh source of drift. Canonical values are
treated as real-valued (not forced-integer) millimeters, which makes the imperial
round trip exact because 1 in = 25.4 mm and 1 ft = 304.8 mm exactly.

**Action:** record this divergence in a local knowledge-graph ADR (ADR-0027) and flag
the SI-meters reconciliation as a separate cross-cutting decision for the maintainer.
This slice does not resolve it.

### Type alias, not branded type

`Millimeters` is a documented `number` alias, not a branded type. `core/model` exposes
plain `number` millimeters and this slice may not modify those consumers; a brand
would force casts at every model boundary and undermine its own safety. Branding is a
documented future consideration to revisit if the model adopts branded units.

### Scope: length only

Format and parse cover **length** only. Area (square meters / square feet) and volume
(cubic meters / cubic feet) are deferred: the model is length-only today and the
room/area work is owned by a concurrent slice this work must stay off. The
`UnitPreferences` structure is shaped so area and volume precision become additional
fields later without a breaking change.

### Other deferrals (documented, out of this slice)

- Angle / bearing units.
- Localized unit symbols and locale-aware number formatting (i18n section 7.2); this
  slice emits en-US symbols (`'`, `"`, `ft`, `in`, `m`, `cm`, `mm`).
- Reconciling the design specification's "SI meters" wording with the model.
- A branded `Millimeters` type.

These are recorded in the ROADMAP Units row as well.

---

## Public API surface (the shared contract)

All names below are the contract the `test-author` and `implementer` agents converge
on. Exported from `core/units/index.ts` and re-exported from `core/index.ts`.

### `core/units/length-units.ts`

```ts
/** A length in real-valued millimeters: the canonical storage unit, matching core/model. */
export type Millimeters = number

export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = 304.8
export const MM_PER_CENTIMETER = 10
export const MM_PER_METER = 1000

export type ImperialForm = 'feet-and-inches' | 'decimal-feet' | 'decimal-inches'
export type MetricForm = 'meters' | 'centimeters' | 'millimeters'

// Integer-scaled to avoid float drift (e.g. inches * 254 / 10, not inches * 25.4).
export function inchesToMillimeters(inches: number): Millimeters
export function millimetersToInches(mm: Millimeters): number
export function feetToMillimeters(feet: number): Millimeters
export function millimetersToFeet(mm: Millimeters): number
export function centimetersToMillimeters(centimeters: number): Millimeters
export function millimetersToCentimeters(mm: Millimeters): number
export function metersToMillimeters(meters: number): Millimeters
export function millimetersToMeters(mm: Millimeters): number
```

### `core/units/precision.ts`

```ts
export type DisplayPrecision =
  | { kind: 'decimal-places'; places: number }
  | { kind: 'fraction'; denominator: number }

/** Rounds half away from zero (symmetric for negatives, unlike Math.round). */
export function roundToDecimalPlaces(value: number, places: number): number

/**
 * Rounds a non-negative value to the nearest 1/denominator, returns a reduced
 * fraction; numerator may be 0. Sign is the caller's responsibility (formatLength
 * formats the magnitude and applies the sign around it).
 */
export function roundToNearestFraction(
  value: number,
  denominator: number,
): { whole: number; numerator: number; denominator: number }
```

### `core/units/preferences.ts`

```ts
import type { UnitSystem } from '../model/types'

export interface UnitPreferences {
  system: UnitSystem
  imperialForm: ImperialForm
  metricForm: MetricForm
  imperialLengthPrecision: DisplayPrecision
  metricLengthPrecision: DisplayPrecision
}

export const DEFAULT_IMPERIAL_PREFERENCES: UnitPreferences
export const DEFAULT_METRIC_PREFERENCES: UnitPreferences

/** Resolves the active system's form and precision into explicit format options. */
export function lengthFormatOptions(preferences: UnitPreferences): FormatLengthOptions
```

Defaults:

```ts
DEFAULT_IMPERIAL_PREFERENCES = {
  system: 'imperial',
  imperialForm: 'feet-and-inches',
  metricForm: 'millimeters',
  imperialLengthPrecision: { kind: 'fraction', denominator: 8 },
  metricLengthPrecision: { kind: 'decimal-places', places: 0 },
}
DEFAULT_METRIC_PREFERENCES = { ...DEFAULT_IMPERIAL_PREFERENCES, system: 'metric' }
```

### `core/units/format-length.ts`

```ts
export type FormatLengthOptions =
  | { system: 'imperial'; form: ImperialForm; precision: DisplayPrecision }
  | { system: 'metric'; form: MetricForm; precision: { kind: 'decimal-places'; places: number } }

export function formatLength(mm: Millimeters, options: FormatLengthOptions): string
```

Rules:

- `fraction` precision is valid only for `feet-and-inches`. Any other form with a
  `fraction` precision throws a clear error. All forms accept `decimal-places`.
- `feet-and-inches` drops a zero feet part (`8 1/2"`, not `0'8 1/2"`) and a zero inch
  part (`6'`), and carries a rounded `12"` up to the next foot (`1'0"`).
- Sign is preserved (`-8'0"`, `-2030 mm`). Zero formats without a sign.

### `core/units/parse-length.ts`

```ts
export interface ParseLengthOptions {
  /** Unit assumed for a bare number with no unit token. Omitted means a bare number throws. */
  assumeUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft'
}

export function parseLength(input: string, options?: ParseLengthOptions): Millimeters
```

Rules:

- Tolerant of case, surrounding whitespace, and optional space before the unit.
- Throws a clear `Error` for unparseable input; never returns null.

---

## File structure

```
core/units/length-units.ts        type aliases, conversion constants, pure conversions
core/units/length-units.test.ts
core/units/precision.ts           DisplayPrecision, rounding helpers
core/units/precision.test.ts
core/units/preferences.ts         UnitPreferences, defaults, lengthFormatOptions
core/units/preferences.test.ts
core/units/format-length.ts       formatLength and per-form formatters
core/units/format-length.test.ts
core/units/parse-length.ts        parseLength and the tolerant tokenizer
core/units/parse-length.test.ts
core/units/round-trip.test.ts     cross-cutting no-drift invariant (deterministic generative)
core/units/index.ts               module barrel
```

`core/index.ts` is the only file outside `core/units/` this slice modifies.

---

## Task 1: Length conversions

**Files:** Create `core/units/length-units.ts`, `core/units/length-units.test.ts`.

Behavior: exact conversions with no floating-point drift. Implementation uses
integer-scaled arithmetic (for example `inches * 254 / 10`, `mm * 10 / 254`) so exact
values stay exact.

| call                             | result                               |
| -------------------------------- | ------------------------------------ |
| `inchesToMillimeters(1)`         | `25.4`                               |
| `inchesToMillimeters(80)`        | `2032` (exactly, not `2031.9999...`) |
| `millimetersToInches(2032)`      | `80` (exactly)                       |
| `feetToMillimeters(1)`           | `304.8`                              |
| `feetToMillimeters(6)`           | `1828.8`                             |
| `millimetersToFeet(1828.8)`      | `6`                                  |
| `metersToMillimeters(2.03)`      | `2030`                               |
| `millimetersToMeters(2030)`      | `2.03`                               |
| `centimetersToMillimeters(203)`  | `2030`                               |
| `millimetersToCentimeters(2030)` | `203`                                |

- [ ] RED: `/test-first conversions between millimeters and inches, feet, centimeters, and meters are exact`
- [ ] Verify the test fails (functions undefined). Run: `pnpm exec vitest run core/units/length-units.test.ts`
- [ ] GREEN: `/implement`
- [ ] Verify it passes. Run: `pnpm exec vitest run core/units/length-units.test.ts`
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 2: Rounding helpers

**Files:** Create `core/units/precision.ts`, `core/units/precision.test.ts`.

| call                                | result                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `roundToDecimalPlaces(6.66666, 3)`  | `6.667`                                                               |
| `roundToDecimalPlaces(2030.4, 0)`   | `2030`                                                                |
| `roundToDecimalPlaces(2.5, 0)`      | `3` (half away from zero)                                             |
| `roundToDecimalPlaces(-2.5, 0)`     | `-3` (half away from zero; `Math.round(-2.5)` is `-2`)                |
| `roundToNearestFraction(8.5, 16)`   | `{ whole: 8, numerator: 1, denominator: 2 }` (8/16 reduced)           |
| `roundToNearestFraction(8.0, 16)`   | `{ whole: 8, numerator: 0, denominator: 1 }`                          |
| `roundToNearestFraction(11.97, 16)` | `{ whole: 12, numerator: 0, denominator: 1 }` (carries)               |
| `roundToNearestFraction(8.25, 8)`   | `{ whole: 8, numerator: 1, denominator: 4 }` (8 2/8 reduced to 8 1/4) |

Note: `roundToNearestFraction` returns the fraction reduced to lowest terms; the whole
part carries when the fractional part rounds up to a full unit; it is defined for
non-negative input (the formatter handles sign).

- [ ] RED: `/test-first decimal and nearest-fraction rounding, including fraction reduction and carrying`
- [ ] Verify fails. Run: `pnpm exec vitest run core/units/precision.test.ts`
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 3: Metric formatting

**Files:** Create `core/units/format-length.ts`, `core/units/format-length.test.ts`.

Only the metric branch in this task. `decimal-places` precision.

| mm      | options                                     | result     |
| ------- | ------------------------------------------- | ---------- |
| `2030`  | `{ metric, meters, decimal-places 2 }`      | `2.03 m`   |
| `2030`  | `{ metric, millimeters, decimal-places 0 }` | `2030 mm`  |
| `2030`  | `{ metric, centimeters, decimal-places 0 }` | `203 cm`   |
| `2032`  | `{ metric, meters, decimal-places 3 }`      | `2.032 m`  |
| `0`     | `{ metric, millimeters, decimal-places 0 }` | `0 mm`     |
| `-2030` | `{ metric, millimeters, decimal-places 0 }` | `-2030 mm` |

- [ ] RED: `/test-first formatLength renders metric meters, centimeters, and millimeters with decimal precision`
- [ ] Verify fails. Run: `pnpm exec vitest run core/units/format-length.test.ts`
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 4: Imperial decimal forms

**Files:** Modify `core/units/format-length.ts`, `core/units/format-length.test.ts`.

| mm       | options                                          | result   |
| -------- | ------------------------------------------------ | -------- |
| `2032`   | `{ imperial, decimal-feet, decimal-places 3 }`   | `6.667'` |
| `2032`   | `{ imperial, decimal-inches, decimal-places 0 }` | `80"`    |
| `2044.7` | `{ imperial, decimal-inches, decimal-places 1 }` | `80.5"`  |
| `1828.8` | `{ imperial, decimal-feet, decimal-places 2 }`   | `6.00'`  |
| `-2032`  | `{ imperial, decimal-inches, decimal-places 0 }` | `-80"`   |

- [ ] RED: `/test-first formatLength renders imperial decimal feet and decimal inches`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 5: Imperial feet-and-inches (whole and decimal inch)

**Files:** Modify `core/units/format-length.ts`, `core/units/format-length.test.ts`.

`decimal-places` precision on the inch part. Drop zero feet / zero inches; preserve sign.

| mm        | options                                           | result   |
| --------- | ------------------------------------------------- | -------- |
| `2032`    | `{ imperial, feet-and-inches, decimal-places 0 }` | `6'8"`   |
| `2044.7`  | `{ imperial, feet-and-inches, decimal-places 1 }` | `6'8.5"` |
| `1828.8`  | `{ imperial, feet-and-inches, decimal-places 0 }` | `6'`     |
| `203.2`   | `{ imperial, feet-and-inches, decimal-places 0 }` | `8"`     |
| `0`       | `{ imperial, feet-and-inches, decimal-places 0 }` | `0"`     |
| `-2438.4` | `{ imperial, feet-and-inches, decimal-places 0 }` | `-8'`    |

Note: `-2438.4 mm = -96 in = -8 ft 0 in`, so it formats as `-8'` (zero inch dropped).

- [ ] RED: `/test-first formatLength renders imperial feet-and-inches with whole and decimal inches, dropping zero parts and preserving sign`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 6: Imperial fractional inches

**Files:** Modify `core/units/format-length.ts`, `core/units/format-length.test.ts`.

`fraction` precision, valid only for `feet-and-inches`. Reduce fractions, carry a full
`12"` to the next foot, drop zero parts.

| mm        | options                                      | result                                           |
| --------- | -------------------------------------------- | ------------------------------------------------ |
| `2044.7`  | `{ imperial, feet-and-inches, fraction 2 }`  | `6'8 1/2"`                                       |
| `215.9`   | `{ imperial, feet-and-inches, fraction 2 }`  | `8 1/2"`                                         |
| `2032`    | `{ imperial, feet-and-inches, fraction 16 }` | `6'8"` (zero fraction dropped)                   |
| `304.038` | `{ imperial, feet-and-inches, fraction 16 }` | `1'0"` (11.97" carries to 1'0")                  |
| `2051.05` | `{ imperial, feet-and-inches, fraction 8 }`  | `6'8 3/4"` (8.75" → 8 3/4")                      |
| `0`       | `{ imperial, feet-and-inches, fraction 16 }` | `0"`                                             |
| `2032`    | `{ imperial, decimal-feet, fraction 16 }`    | throws (fraction only valid for feet-and-inches) |
| `2032`    | `{ imperial, feet-and-inches, fraction 0 }`  | throws (denominator must be a positive integer)  |
| `2032`    | `{ imperial, feet-and-inches, fraction -8 }` | throws (denominator must be a positive integer)  |

`formatLength` validates the fraction denominator at this boundary (a positive integer)
before handing it to `roundToNearestFraction`, since the denominator originates in
user-controlled `UnitPreferences` (Task 7). This is the deferred should-fix from the
Task 2 review: the guard lives at the consumer boundary, not in the low-level helper.

- [ ] RED: `/test-first formatLength renders fractional inches in feet-and-inches, reducing and carrying, and rejects fraction precision for other forms or an invalid denominator`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 7: Preferences and option resolution

**Files:** Create `core/units/preferences.ts`, `core/units/preferences.test.ts`.

| call                                                                                                                                                     | result                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)`                                                                                                      | `{ system: 'imperial', form: 'feet-and-inches', precision: { kind: 'fraction', denominator: 8 } }` |
| `lengthFormatOptions(DEFAULT_METRIC_PREFERENCES)`                                                                                                        | `{ system: 'metric', form: 'millimeters', precision: { kind: 'decimal-places', places: 0 } }`      |
| `lengthFormatOptions({ ...DEFAULT_IMPERIAL_PREFERENCES, imperialForm: 'decimal-feet', imperialLengthPrecision: { kind: 'decimal-places', places: 3 } })` | `{ system: 'imperial', form: 'decimal-feet', precision: { kind: 'decimal-places', places: 3 } }`   |

Also assert `formatLength(2030, lengthFormatOptions(DEFAULT_METRIC_PREFERENCES)) === '2030 mm'`
to prove the preference path composes with the formatter.

- [ ] RED: `/test-first lengthFormatOptions resolves the active system's form and precision from preferences`
- [ ] Verify fails. Run: `pnpm exec vitest run core/units/preferences.test.ts`
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 8: Metric parsing

**Files:** Create `core/units/parse-length.ts`, `core/units/parse-length.test.ts`.

Only metric inputs in this task.

| input                | result (mm)                           |
| -------------------- | ------------------------------------- |
| `'2.03 m'`           | `2030`                                |
| `'2.03m'`            | `2030`                                |
| `'2.03 meters'`      | `2030`                                |
| `'2030 mm'`          | `2030`                                |
| `'2030mm'`           | `2030`                                |
| `'2030 millimeters'` | `2030`                                |
| `'203 cm'`           | `2030`                                |
| `'  2.03 M '`        | `2030` (whitespace and case tolerant) |
| `'-2.03 m'`          | `-2030`                               |

- [ ] RED: `/test-first parseLength reads metric meters, centimeters, and millimeters tolerant of case, spacing, and full unit words`
- [ ] Verify fails. Run: `pnpm exec vitest run core/units/parse-length.test.ts`
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 9: Imperial parsing (whole and decimal)

**Files:** Modify `core/units/parse-length.ts`, `core/units/parse-length.test.ts`.

| input               | result (mm)                      |
| ------------------- | -------------------------------- |
| `'6\'8"'`           | `2032`                           |
| `'6\' 8"'`          | `2032`                           |
| `'6ft 8in'`         | `2032`                           |
| `'6 ft 8 in'`       | `2032`                           |
| `'6 feet 8 inches'` | `2032`                           |
| `'80 in'`           | `2032`                           |
| `'80"'`             | `2032`                           |
| `'80 inches'`       | `2032`                           |
| `'6.667 ft'`        | `2032.1016` (assert within 1e-6) |
| `"6.667'"`          | `2032.1016` (assert within 1e-6) |
| `"6'"`              | `1828.8`                         |
| `"-8'"`             | `-2438.4`                        |

- [ ] RED: `/test-first parseLength reads imperial feet-and-inches, decimal feet, and decimal/whole inches with ft/in and symbol notations`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 10: Imperial fractional parsing

**Files:** Modify `core/units/parse-length.ts`, `core/units/parse-length.test.ts`.

| input             | result (mm)                                 |
| ----------------- | ------------------------------------------- |
| `'6\'8 1/2"'`     | `2044.7`                                    |
| `'8 1/2"'`        | `215.9`                                     |
| `'6 ft 8 1/2 in'` | `2044.7`                                    |
| `'8-1/2"'`        | `215.9` (hyphen between whole and fraction) |
| `'1/2"'`          | `12.7`                                      |

- [ ] RED: `/test-first parseLength reads fractional inches in feet-and-inches and inches-only notations`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 11: Parser error handling and assumed unit

**Files:** Modify `core/units/parse-length.ts`, `core/units/parse-length.test.ts`.

| input / options                             | behavior                              |
| ------------------------------------------- | ------------------------------------- |
| `parseLength('80', { assumeUnit: 'in' })`   | `2032`                                |
| `parseLength('2030', { assumeUnit: 'mm' })` | `2030`                                |
| `parseLength('80')`                         | throws (bare number, no assumed unit) |
| `parseLength('banana')`                     | throws                                |
| `parseLength('')`                           | throws                                |
| `parseLength('6 fathoms')`                  | throws (unknown unit)                 |

Error messages name the offending input and never return null.

- [ ] RED: `/test-first parseLength applies an assumed unit to bare numbers and throws a clear error on unparseable input`
- [ ] Verify fails.
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 12: Round-trip invariant (no drift)

**Files:** Create `core/units/round-trip.test.ts`. No implementation file: this test
pins the cross-cutting guarantee that the parser and formatter already satisfy. If it
fails, the fix is in `format-length.ts` / `parse-length.ts`, so the GREEN phase for
this cycle may be an empty implementation commit if no change is needed.

Invariant, for every form and a range of precisions, over a deterministic seeded set of
millimeter values (seed logged to the test output per the FIRST rule on property-based
tests):

1. `s = formatLength(x, options)`.
2. `x2 = parseLength(s)`.
3. `formatLength(x2, options) === s` (string fixpoint, asserted exactly).
4. `|x2 - x|` is within one display quantum of `options.precision` (numeric closeness,
   small epsilon to absorb float fuzz).

Cover: metric meters/cm/mm at 0-3 decimal places; imperial decimal-feet and
decimal-inches at 0-3 places; imperial feet-and-inches at fraction denominators 2, 4,
8, 16; include negative and zero values.

- [ ] RED: `/test-first formatting then parsing then formatting is a fixpoint and stays within one display quantum across all forms and precisions`
- [ ] Verify fails or passes; if it fails, treat as a real defect in format/parse.
- [ ] GREEN: `/implement` (fix format/parse if needed; otherwise empty implementation commit)
- [ ] Verify passes. Run: `pnpm exec vitest run core/units/round-trip.test.ts`
- [ ] BLUE: `/clean-code-review` then `/refactor`

## Task 13: Barrel wiring and public surface

**Files:** Create `core/units/index.ts`; modify `core/index.ts`.

`core/units/index.ts` re-exports the public types and functions:
`Millimeters`, `ImperialForm`, `MetricForm`, `MM_PER_INCH`, `MM_PER_FOOT`,
`MM_PER_CENTIMETER`, `MM_PER_METER`, conversion functions, `DisplayPrecision`,
`roundToDecimalPlaces`, `roundToNearestFraction`, `UnitPreferences`,
`DEFAULT_IMPERIAL_PREFERENCES`, `DEFAULT_METRIC_PREFERENCES`, `lengthFormatOptions`,
`FormatLengthOptions`, `formatLength`, `ParseLengthOptions`, `parseLength`.

`core/index.ts` re-exports the same surface from `./units`.

- [ ] RED: `/test-first the core barrel re-exports the units public surface` (a small test importing `formatLength` and `parseLength` from `core` / `../..` and asserting a representative round trip, e.g. `parseLength(formatLength(2032, lengthFormatOptions(DEFAULT_IMPERIAL_PREFERENCES)))`).
- [ ] Verify fails (barrel does not export yet).
- [ ] GREEN: `/implement`
- [ ] Verify passes.
- [ ] BLUE: `/clean-code-review` then `/refactor`
- [ ] Full check chain: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] Confirm `tests/architecture/layer-boundaries.test.ts` still passes (no React/Three.js import crept into `core/units/`).

## Closeout (not RGB cycles)

- [ ] Write local ADR-0027 under `docs/knowledge/` recording the millimeter-vs-SI-meters
      divergence and its deferral, via the `knowledge-curator`. (Gitignored; local cache only.)
- [ ] Update ROADMAP.md: add a single **Units** row reflecting status and listing the
      area/volume, angle, i18n, and SI-reconciliation deferrals. Limit edits to that row.
- [ ] `/review`: dispatch the `pr-reviewer` for the end-of-branch audit (RGB ordering,
      independence, blue presence, CI green).

---

## Self-review

**Spec coverage (design specification section 7.3):**

- Internal storage SI: divergence surfaced; this slice targets the model's millimeters
  and defers reconciliation (ADR-0027). Covered by the Decisions section.
- Display conversion at the UI boundary in `core/units/`: Tasks 3-7, 13.
- Multiple imperial display forms (`6'8"`, `6.667'`, `80"`): Tasks 4-6.
- Tolerant input parsers (`6'8"`, `6 ft 8 in`, `6.667 ft`, `80 in`, `2.03 m`, `2030 mm`):
  Tasks 8-11.
- Display precision configurable per category: `DisplayPrecision` (Task 2),
  `UnitPreferences` per-system length precision (Task 7); area/volume categories deferred.
- No round-trip drift: Task 12.

**Type consistency:** `formatLength`, `parseLength`, `FormatLengthOptions`,
`UnitPreferences`, `DisplayPrecision`, `roundToNearestFraction`,
`lengthFormatOptions`, and the conversion function names are used identically in the
API surface and every task table.

**Placeholder scan:** no TBD/TODO; every task carries concrete example tables and the
exact command to run.
