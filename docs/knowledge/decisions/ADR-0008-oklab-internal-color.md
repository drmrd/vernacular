---
slug: decisions/ADR-0008-oklab-internal-color
title: 'ADR-0008: OKLab as the internal color representation'
type: decision
tags: [color, color-science, paint, oklab]
related: [decisions/ADR-0004-three-js-r3f-webgpu]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0008: OKLab as the internal color representation

## Status

Accepted. Implementation lands in Phase 0g (basic paint material) and gains fidelity in Phase 6.

## Context

Vernacular's value-add over generic floor planners is fidelity for paint, finish, and lighting. Storing paint colors in sRGB makes mixing and comparison hue-distorted; CIELAB is perceptually uniform but older and less faithful to modern displays. OKLab (Björn Ottosson, 2020) is perceptually uniform, mathematically tractable, and matches modern wide-gamut displays well.

## Decision

All paint colors, palette entries, and intermediate color operations (mixing, comparing, interpolating) use OKLab internally. The conversion to sRGB (or Display P3 on wide-gamut devices) happens only at the renderer boundary, with proper gamma. The custom `PaintMaterial` shader receives OKLab inputs and produces gamma-correct outputs.

Palette entries store color in three forms simultaneously: OKLab (canonical), sRGB hex (display and serialization convenience), and `originalSpec` (the source brand or vendor identifier, e.g., a Sherwin-Williams code).

## Consequences

- Mixing two paints in OKLab produces a perceptually plausible midpoint, not a muddy sRGB average.
- The color-temperature slider in Phase 0g can shift paint perception in real time without recomputing palettes.
- Phase 6 paint catalogs from third parties carry the brand's stated sRGB hex (for compatibility with their tooling) while we use OKLab for everything else.

## References

- Design specification, section 7.4 (Color science).
- Björn Ottosson, ["A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/), 2020.
