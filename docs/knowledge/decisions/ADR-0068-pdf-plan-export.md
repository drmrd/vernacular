---
slug: decisions/ADR-0068-pdf-plan-export
title: 'ADR-0068: PDF plan export: embed the raster on a printable page'
type: decision
tags:
  [
    architecture,
    export,
    output-track,
    pdf,
    pdf-lib,
    raster,
    rasterization,
    storage-seam,
    dependency,
    cooldown,
    units,
    page-size,
    testing,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/plans/2026-06-13-pdf-plan-export.md,
    storage/download/pdf-plan-filename.ts,
    storage/download/pdf-page.ts,
    storage/download/pdf-plan-layout.ts,
    storage/download/pdf-plan-document.ts,
    storage/download/rasterize-svg.ts,
    storage/index.ts,
    app/use-project-actions.ts,
    editor/shell/project-controls.tsx,
    e2e/tests/export-plan-pdf.spec.ts,
  ]
status: current
updated: 2026-06-13
---

# ADR-0068: PDF plan export: embed the raster on a printable page

## Status

Accepted. The document-format export of the output-and-export track
([[ADR-0044-mvp-delivery-tracks-and-parallel-resequencing]]), beside the vector (SVG)
and raster (PNG) exports already shipped. It completes the two-dimensional export trio
named in the public-alpha deliverable: vector, document, image.

## Context

The plan exports as SVG and as PNG. The remaining two-dimensional export is the document
format, a PDF the user can print or send to a contractor. A PDF can hold the plan two
ways: as vector drawing commands translated from the SVG, or as a raster image placed on
a page. The vector route reproduces the plan as crisp line work at any zoom but needs a
second renderer (an SVG-to-PDF mapping) and a second dependency, and it is a fresh code
path that can drift from how the plan looks on screen. The raster route reuses the one
plan renderer the SVG and PNG exports already share.

A PDF also needs an assembler. Writing the binary format by hand is not reasonable, so
the export takes a dependency, and the repository holds every dependency to a 30-day
release cooldown with exact version pins and a committed lockfile.

## Decision

### Embed the raster; defer the vector PDF

The PDF embeds the same PNG raster the image export produces, placed on a printable page.
There is one plan renderer, so the plan looks the same across SVG, PNG, and PDF, and the
document export adds page layout rather than a second drawing path. A true vector PDF is a
later enhancement; it is recorded as deferred, not rejected, and it would slot in beside
this raster path behind the same export button.

### `pdf-lib` assembles the document

`pdf-lib@1.17.1` creates the document, embeds the PNG, and writes the bytes. It is the
latest release, MIT-licensed, and years old, so it clears the cooldown comfortably; it is
pinned exactly with the lockfile committed. It is pure JavaScript with no DOM and no
native binary, which matters for the next decision.

### The assembler is a storage seam with an injectable rasterizer

The assembler `svgPlanToPdf` lives beside the other download helpers, under the rule that
browser and platform work is wrapped at a `storage/` seam
([[ADR-0001-six-layer-architecture]]). The one browser dependency is the rasterization
itself (`rasterizeSvgToPng` uses an `Image` and a canvas), so it is injected as a
parameter that defaults to the real rasterizer. A test passes a fake that returns known
PNG bytes, which lets the page-assembly logic run in Node and be unit-tested directly,
while the end-to-end test exercises the real rasterize-and-assemble path in a browser.
This is why a pure-JavaScript assembler was worth choosing: the interesting logic stays
testable without a display.

### Page size derives from the project's units; orientation from the plan

The page size follows the project's unit system: an imperial project prints on US Letter,
a metric project on ISO A4. Orientation is not a setting; it follows the plan, landscape
when the plan is wider than it is tall and portrait otherwise. The plan image is then fit
inside a margin and centered, preserving its aspect ratio and never upscaling past the
raster. The unit-to-page mapping and the fit-and-center geometry are pure functions
(`pdfPageSize`, `placePlanOnPage`), unit-tested apart from the assembler.

### A higher resolution for print

The on-screen PNG export caps the raster's longest edge at 2000 pixels; the PDF raster
caps at 4000 so a printed page holds enough detail. The existing pure cap rule
(`rasterTargetSize`) still scales down to the cap and never up, so a small plan keeps its
intrinsic size.

### The MVP is the plan image alone

The first version centers the plan on a white page with a margin. A title block (project
name, export date, a scale bar) is deferred, as is a single export menu in place of the
three separate format buttons and a user-chosen page size or resolution.

## Consequences

The plan now exports in all three two-dimensional formats from one renderer, so they stay
visually consistent and the document export is mostly page layout. The first runtime
dependency for export joins the tree, pinned and cooled; the binary assembly is isolated
behind a storage seam, and its layout logic is pure and tested. The cost is that the PDF
is a raster: it does not stay crisp under arbitrary magnification the way a vector PDF
would. That trade is deliberate and reversible, since the vector path can be added later
behind the same button without disturbing this one.
