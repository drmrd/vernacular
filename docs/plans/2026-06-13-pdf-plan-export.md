# Export the two-dimensional plan as PDF

Output-and-export track. Adds the document (PDF) plan export beside the vector (SVG) and raster (PNG)
exports, completing the two-dimensional export trio (vector, document, image) named in the alpha
deliverable.

## The gap

The SVG and PNG exports now download from the editor. The remaining two-dimensional export is the
document format: a PDF the user can hand to a contractor or print. The roadmap row "PDF (document) plan
export" is scoped and the owner has chosen the approach: embed the existing PNG rasterization on a
printable page using a mature library, rather than write a second (vector) renderer now.

## Design decisions (forks decided)

1. **Raster-embed, not vector.** The PDF embeds the same PNG raster the image export produces, placed on
   a printable page. There is one plan renderer; the PDF is that raster on paper. A true vector PDF
   (an SVG-to-PDF path) is a future enhancement, deferred. This keeps a single source of truth for how a
   plan looks across SVG, PNG, and PDF.
2. **`pdf-lib` as the document assembler.** `pdf-lib@1.17.1` (MIT, ~1680 days old, clears the 30-day
   cooldown, exact-pinned, lockfile committed) creates the document, embeds the PNG, and writes the
   bytes. It is pure JavaScript (no DOM, no native binary), so the assembly logic is unit-testable in
   Node.
3. **The assembler is a `storage/` seam with an injectable rasterizer.** `svgPlanToPdf` lives beside the
   other download helpers (ADR-0001). The DOM rasterization (`rasterizeSvgToPng`) is the only browser
   dependency, so it is injected (default = the real rasterizer); tests pass a fake that returns known
   PNG bytes, which lets the page-assembly logic (page size, orientation, fit) be unit-tested without a
   browser. The end-to-end test proves the real rasterization path.
4. **Print-quality raster.** The PDF rasterizes at a higher cap than the on-screen PNG export
   (`PRINT_RASTER_MAX_EDGE`, 4000 px vs the screen default 2000 px) so a printed page has enough
   resolution. The existing pure `rasterTargetSize` rule still caps and never upscales.
5. **Page size derives from the project's units.** Imperial projects get US Letter; metric projects get
   ISO A4 (owner decision). The pure rule `pdfPageSize(units)` returns the portrait page in PDF points
   (1/72 inch).
6. **Orientation auto-derives from the plan's aspect ratio.** A plan wider than it is tall lays out on a
   landscape page; otherwise portrait. The pure rule `placePlanOnPage` swaps the page dimensions when the
   content is landscape, then fits the image inside a margin, centered, preserving aspect ratio.
7. **Plan image only (no title block).** The MVP centers the plan on a white page with a margin; a
   title/metadata block (project name, date, scale) is deferred (owner decision).
8. **A third "Export PDF" button.** It sits beside "Export plan" (SVG) and "Export PNG", routed through
   the same `ProjectAction` helper. The export-button naming unification stays deferred polish.

## Modules

- `storage/download/pdf-plan-filename.ts` -> `pdfPlanFilename(name)` (mirrors `pngPlanFilename`, `.pdf`).
- `storage/download/pdf-page.ts` -> `pdfPageSize(units)` (Letter/A4 portrait, points) + size constants.
- `storage/download/pdf-plan-layout.ts` -> `placePlanOnPage(content, page, marginPt)` (pure: orientation
  - center-fit), returning `{ page: {width,height}, image: {x,y,width,height} }`.
- `storage/download/pdf-plan-document.ts` -> `svgPlanToPdf(svg, options)` (the `pdf-lib` seam), plus
  `PRINT_RASTER_MAX_EDGE` and `PDF_DEFAULT_MARGIN_PT`.
- Barrel exports added to `storage/index.ts`.
- `editor/shell/project-controls.tsx` gains the `onExportPdf` prop + button.
- `app/use-project-actions.ts` gains `onExportPdf` (export SVG -> `svgPlanToPdf` -> `downloadBytes`); the
  prop auto-threads (`app.tsx` spreads `{...actions}`, `editor-shell` spreads `{...projectControls}`).

## RGB cycles

- **A (filename rule).** RED: `pdfPlanFilename('Untitled project')` is `'untitled-project.pdf'`; empty
  falls back to `'project.pdf'`. GREEN: implement on the shared `filenameSlug`. BLUE.
- **B (page size by units).** RED: `pdfPageSize('imperial')` is Letter (612x792), `pdfPageSize('metric')`
  is A4 (595.28x841.89), portrait. GREEN: implement the pure mapping. BLUE.
- **C (placement).** RED: `placePlanOnPage` keeps portrait for a tall plan and swaps to landscape for a
  wide plan; fits the image inside the margin preserving aspect ratio; centers it (equal gaps). GREEN:
  implement the pure geometry. BLUE.
- **D (assembler seam).** RED: `svgPlanToPdf` with an injected fake rasterizer returning a known
  landscape PNG produces loadable PDF bytes (`%PDF-` header, parses via `PDFDocument.load`) with exactly
  one page sized landscape Letter for imperial units. GREEN: implement with `pdf-lib` (embed, size page,
  draw image at the computed placement, save). BLUE.
- **E (export button).** RED: `ProjectControls` renders an "Export PDF" button when `onExportPdf` is
  provided and calls it on click; omits it otherwise. GREEN: add the prop + button. BLUE.
- **F (wire the export).** RED: a top-level e2e (`e2e/tests/export-plan-pdf.spec.ts`, mirroring the PNG
  one) clicks "Export PDF" and expects a download named `untitled-project.pdf`; it fails because the
  action is unwired. GREEN: add the `onExportPdf` handler in `useProjectActions` (export SVG ->
  `svgPlanToPdf` with the project units and the print max-edge -> download the PDF bytes), confirm the
  prop threads. BLUE. Commit the e2e as `test:` so it is the cycle's RED.

## Verification

Full local gate (`typecheck && lint && format:check && test && integration:audit && build`) plus
`rgb:audit` clean (`origin/main..HEAD`) and the chromium e2e tree after a rebuild (kill any stale 4173).
The PDF download e2e is observable on headless chromium and firefox; skipped on webkit (the shell does
not render headlessly), matching the bundle, SVG, and PNG export specs. The main thread runs the e2e
locally to confirm the real rasterize-and-assemble path works before pushing.

## Deferred

- A true vector PDF (SVG-to-PDF), which needs a second mature dependency and a renderer mapping.
- A title/metadata block (project name, export date, scale bar) on the page.
- A single export format menu and a consistent naming family in place of three separate buttons.
- A user-chosen page size, orientation, or DPI; this slice derives them from units and aspect ratio.
- Multi-page export (one floor per page) once multi-floor export lands.
