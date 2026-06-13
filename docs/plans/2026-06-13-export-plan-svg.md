# Export the two-dimensional plan as SVG

Output-and-export track. Surfaces the built-but-unreachable SVG plan exporter as a download.

## The gap

`SvgPlanExporter` (`core/export/svg/svg-plan-exporter.ts`) is built and tested: it derives the scene
graph and renders walls, rooms, openings, labels, and dimensions to an `ExportResult`
(`{ media: 'image/svg+xml', extension: 'svg', content }`). It is exported from the `core` barrel but
called nowhere outside core, so there is no way to export a plan. The only export the editor surfaces is
the `.building` bundle. This is the alpha "two-dimensional export (vector)" bullet.

## Design decisions (forks decided)

1. **A download button next to "Export bundle."** A new "Export plan" button in `ProjectControls`,
   wired through the existing `ProjectActions` -> `EditorShell` -> `ProjectControls` chain (the shell
   already spreads the actions), triggers the SVG download. It mirrors the bundle export exactly.
2. **A pure filename rule reusing the bundle slug.** `svgPlanFilename(projectName)` returns
   `<slug>.svg` using the same sanitization as `bundleFilename`. The slug logic is extracted into a
   shared helper so the two filename rules do not duplicate it; `bundleFilename` keeps its behavior and
   tests.
3. **A text-download seam beside the bytes one.** `downloadText(text, filename, media)` joins
   `downloadBytes` in `storage/download`, sharing one anchor-click helper (no duplication). SVG content
   is a UTF-8 string, so a `Blob([text], { type: media })` download is the natural fit; this keeps all
   DOM download code at the `storage/` seam (ADR-0001).
4. **Default metric units for the export.** The exporter accepts a unit-preferences option; threading
   the project's units into the export is a noted follow-up, so this slice exports with the exporter
   default. The artifact is a valid plan either way.

No new ADR or spec change: the exporter and the download seam already exist; this wires them together
and adds the button.

## RGB cycles

- **A (filename rule).** RED: `svgPlanFilename('Untitled project')` is `'untitled-project.svg'` and an
  empty/unsafe name falls back to `'project.svg'`. GREEN: extract the shared slug helper, implement
  `svgPlanFilename`, and have `bundleFilename` reuse the helper (its tests stay green). BLUE.
- **B (export button).** RED: `ProjectControls` renders an "Export plan" button when `onExportPlan` is
  provided, and clicking it calls `onExportPlan`; it renders no such button when the prop is absent.
  GREEN: add the optional `onExportPlan` prop and the button (mirroring the bundle button). BLUE.
- **C (wire the export).** RED: a top-level e2e (`e2e/tests/export-plan-svg.spec.ts`, mirroring
  `export-bundle.spec.ts`) clicks "Export plan" and expects a download named `untitled-project.svg`;
  it fails because the action is not wired. GREEN: add `downloadText` (with the shared anchor helper),
  the `onExportPlan` handler in `useProjectActions` (run `SvgPlanExporter`, download the content), and
  confirm `EditorShell` forwards the new prop. BLUE. Commit the e2e as `test:` so it counts as the
  cycle's RED.

## Verification

Full local gate plus `rgb:audit` clean (`origin/main..HEAD`) and the chromium e2e tree after a rebuild.
The new download e2e is observable on headless chromium and firefox; it is skipped on webkit, which
does not render the editor shell headlessly (matching `export-bundle.spec.ts`). `integration:audit`
stays untouched: the export is a top-level e2e, not a journey-coverage capability.

## Deferred

- PNG (image) and PDF (document) plan exporters; PNG needs rasterization and PDF needs a mature
  dependency picked under the cooldown.
- Threading the project's unit preferences into the export.
- A per-export options surface (margin, layers, page size) and a format chooser.
- Exporting a chosen floor versus the whole project (the exporter derives the full scene graph today).
