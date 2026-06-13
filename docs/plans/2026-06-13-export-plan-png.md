# Export the two-dimensional plan as PNG

Output-and-export track. Adds the raster (image) plan export beside the vector (SVG) export.

## The gap

The SVG plan export now downloads from the editor (the previous slice). The alpha export deliverable
also names an image export. A PNG is the natural raster: it needs no new dependency, because the SVG
exporter already produces a self-contained document (`xmlns`, `viewBox`, and `width`/`height`
attributes), so the browser can rasterize it through an `Image` and a `<canvas>`.

## Design decisions (forks decided)

1. **Rasterize the existing SVG; no second renderer.** The PNG export reuses `SvgPlanExporter`, draws
   the SVG onto a canvas, and reads back PNG bytes. There is one plan renderer, and PNG is a raster of
   it. No new dependency.
2. **The rasterizer is a `storage/` browser seam.** `rasterizeSvgToPng` uses `Image`, `<canvas>`, and
   `toBlob`, all browser APIs, so it lives at the `storage/` seam (ADR-0001) beside the download
   helpers. It is async glue with no unit test (jsdom does not rasterize SVG); the e2e proves it.
3. **A pure scale rule caps the raster size.** Plan SVGs are sized in millimeters, so a house is
   thousands of user units wide. `rasterTargetSize(width, height, maxEdge)` is a pure function that
   scales the longest edge down to a maximum (keeping aspect ratio, never upscaling). It is the one bit
   of logic worth pinning, and it is unit-tested.
4. **White background.** The canvas is filled white before the plan is drawn, so the PNG is not
   transparent where the plan paper would be.
5. **A second "Export PNG" button.** It sits beside "Export plan" (the SVG download), routed through the
   same `ProjectAction` helper. Unifying the export controls into a single format menu and renaming for
   a consistent family is deferred polish; this slice keeps the existing SVG button untouched.

## RGB cycles

- **A (filename rule).** RED: `pngPlanFilename('Untitled project')` is `'untitled-project.png'`, empty
  falls back to `'project.png'`. GREEN: implement it on the shared `filenameSlug`. BLUE.
- **B (scale rule).** RED: `rasterTargetSize` scales the longest edge to the max (e.g. 4000x2000 with a
  max of 2000 -> 2000x1000), never upscales (1000x500 max 2000 -> 1000x500), and rounds to whole
  pixels. GREEN: implement the pure function. BLUE.
- **C (export button).** RED: `ProjectControls` renders an "Export PNG" button when `onExportImage` is
  provided and calls it on click; omits it otherwise. GREEN: add the prop and the button. BLUE.
- **D (wire the export).** RED: a top-level e2e (`e2e/tests/export-plan-png.spec.ts`, mirroring the SVG
  one) clicks "Export PNG" and expects a download named `untitled-project.png`; it fails because the
  action is not wired. GREEN: add `rasterizeSvgToPng` (storage), the `onExportImage` handler in
  `useProjectActions` (export SVG, rasterize, download the PNG bytes via `downloadBytes`), and confirm
  the prop threads through. BLUE. Commit the e2e as `test:` so it is the cycle's RED.

## Verification

Full local gate plus `rgb:audit` clean (`origin/main..HEAD`) and the chromium e2e tree after a rebuild.
The PNG download e2e is observable on headless chromium and firefox; skipped on webkit (the shell does
not render headlessly), matching the bundle and SVG export specs. The main thread runs the e2e locally
to confirm the rasterization works before pushing.

## Deferred

- A single export format menu (and a consistent naming family) in place of separate buttons.
- A user-chosen resolution or DPI; this slice uses one capped default.
- PDF (document) export, which needs a mature dependency picked under the cooldown.
- Threading the project's unit preferences into the exported labels (shared with the SVG export).
