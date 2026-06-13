# Plan export honors the project's units

Output-and-export track. A correctness fix: exported plans should label in the project's units.

## The gap

`SvgPlanExporter.export` formats room areas and dimension lengths with
`options?.preferences ?? DEFAULT_METRIC_PREFERENCES`. No caller passes `preferences`, so every export is
metric regardless of `project.meta.units`. An imperial project (a US old-house renovation, the core
audience) exports a plan whose labels read in meters and square meters, which is wrong. The PNG export
rasterizes the same SVG, so it inherits the bug.

## Design decisions (forks decided)

1. **The exporter defaults to the project's units.** Change the fallback from a fixed
   `DEFAULT_METRIC_PREFERENCES` to `preferencesForUnits(project.meta.units)`. An explicit
   `options.preferences` still wins, so callers can override; with none, the export matches the project.
   This is a pure core change with no glue, fully unit-testable, and it fixes both SVG and PNG at once.
2. **A shared `preferencesForUnits` helper.** A pure `preferencesForUnits(units: UnitSystem):
UnitPreferences` lands in `core/units`, mapping metric to `DEFAULT_METRIC_PREFERENCES` and imperial
   to `DEFAULT_IMPERIAL_PREFERENCES`. The same map is duplicated as a local `PREFERENCES_BY_UNITS` in
   four editor files; consolidating those onto this helper is a noted follow-up, kept out of this slice
   to stay focused on the export fix.

No new ADR or spec change: this corrects export behavior to honor an existing model field; it adds no
architecture.

## RGB cycles

- **A (units to preferences).** RED: `preferencesForUnits('metric')` is `DEFAULT_METRIC_PREFERENCES` and
  `preferencesForUnits('imperial')` is `DEFAULT_IMPERIAL_PREFERENCES`. GREEN: implement the pure helper
  in `core/units` and export it from the barrel. BLUE.
- **B (exporter honors units).** RED: `SvgPlanExporter().export(project)` for an imperial project
  produces SVG content with an imperial-formatted label (for example a length in feet and inches),
  whereas it currently emits a metric one. GREEN: default the exporter's `preferences` to
  `preferencesForUnits(project.meta.units)`. BLUE. Confirm the existing exporter tests (metric projects)
  stay green.

## Verification

Full local gate plus `rgb:audit` clean (`origin/main..HEAD`). No e2e or visual change is required: the
default project is metric, so its export is unchanged; the fix is exercised by the new core test on an
imperial project.

## Deferred

- Consolidating the four duplicated editor `PREFERENCES_BY_UNITS` maps onto `preferencesForUnits`.
- A per-export unit override in the export UI (the exporter already accepts one).
