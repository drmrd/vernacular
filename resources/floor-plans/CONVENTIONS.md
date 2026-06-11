# Floor-plan corpus conventions

This corpus is a curated set of real, openly-licensed floor plans used as concrete test
cases for Vernacular, and as a way to find gaps in the current product and roadmap. This
file documents how it is organized, the licensing policy, and how to add a plan.

## Layout

```
resources/floor-plans/
  README.md            generated index plus one section per plan, with inline images
  ATTRIBUTION.md       generated per-plan creator, source, and license list
  CONVENTIONS.md       this file
  NN-slug/             one folder per plan (NN is a two-digit ordinal)
    <slug>.<ext>        the plan image (jpg, png) or pdf
    meta.json           structured metadata (see schema below)
    description.md      prose description (no heading, no image, no attribution)
```

`README.md` and `ATTRIBUTION.md` are generated from the per-plan `meta.json` and
`description.md`. Do not hand-edit them; edit the per-plan files and regenerate.

## Licensing policy

Every file is one of: public domain, a U.S. Government work (for example Library of
Congress HABS, HAER, and HALS measured drawings), Public Domain Mark, CC0, CC BY, or
CC BY-SA. No NonCommercial and no NoDerivatives material. Each plan records its exact
license and a rights-statement URL in `meta.json` and in `ATTRIBUTION.md`. Large originals
were downscaled (longest side at most 2200 pixels) to keep the repository small; the
full-resolution source is linked per entry so the original is always recoverable.

## meta.json schema

Research and download fields (filled when the plan is added):
`ordinal`, `slug`, `title`, `image_file`, `building_type`, `architectural_style`,
`era_or_year`, `country`, `source_landing_url`, `direct_download_url`, `license`,
`license_url`, `creator`, `rightsholder_or_source`, `research_notes`, `research_features`.

Analysis fields (filled by reading the image):
`feature_highlights` (notable things to draw or test), `supported_examples` (capabilities
the plan exercises that ship today), `roadmap_examples` (capabilities it needs that are on
the roadmap), and `gap_features` (an array of `{ "slug": ..., "why": ... }` for capabilities
that are neither shipped nor on the roadmap).

## Capability taxonomy

Each plan is read against three buckets.

- **Supported today** (Phase-1 two-dimensional editor): straight walls at any angle, wall
  thickness and junctions, rooms derived from walls with thickness-aware area, room naming,
  custom-polygon room override (so straight-edged non-rectangular rooms are representable),
  door and window plan symbols, linear dimensions, imperial and metric units, snapping,
  selection, clipboard and transforms, a calibrated raster underlay, a single active floor,
  and an accessible overlay.
- **On the roadmap** (planned tracks): three-dimensional preview, assets and furniture
  (including fixtures and built-in casework), old-house vocabulary (era and room-purpose
  registries, wall construction profiles, curved and period window and door shapes, trim
  and feature data), structure and multi-floor (stacked floors, straight-run stairs,
  per-room ceiling height), output and export, paint and textual site metadata, and the
  user-experience foundation.
- **Gaps** (neither shipped nor on the roadmap): captured as draft feature requests in the
  sibling planning folder `../../../vernacular-planning/` as `feature-<slug>.md`. The slugs
  used by this corpus:
  `multi-building-properties`, `site-and-landscape-plan`, `curved-and-nonlinear-walls`,
  `dome-and-shell-structures`, `covered-outdoor-rooms`, `courtyard-and-atrium-spaces`,
  `room-schedule-and-legend`, `roof-and-sloped-ceiling-geometry`, `split-level-and-mezzanine`,
  `multi-unit-dwellings`, `plan-annotations-north-arrow-scale-bar`,
  `vertical-circulation-beyond-stairs`, `accessibility-clearances-and-turning-spaces`.

## Adding a plan

1. Create `NN-slug/`, place the image, and write a `meta.json` with the research and
   download fields and a clear license.
2. Read the image and fill the analysis fields in `meta.json`, then write `description.md`.
3. If the plan needs a capability that is neither shipped nor on the roadmap, add a
   `gap_features` entry with an existing slug, or create a new `feature-<slug>.md` draft in
   the planning folder and use that slug.
4. Regenerate `README.md` and `ATTRIBUTION.md` from the per-plan files.
