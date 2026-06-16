---
slug: decisions/ADR-0091-pack-integrity-and-build-pipeline
title: 'ADR-0091: Pack on-disk integrity, license policy, and build report'
type: decision
tags: [architecture, packs, validation, integrity, license, build, cli, tooling]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0024-pack-manifest-validation-location,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/specs/2026-06-16-asset-pack-format-and-cli.md,
    docs/plans/2026-06-16-asset-pack-format-and-cli.md,
    scripts/pack/license-policy.mjs,
    scripts/pack/manifest-validation.mjs,
    scripts/pack/pack-integrity.mjs,
    scripts/pack/vernacular-pack.mjs,
    scripts/pack/generate-fixtures.mjs,
    tests/fixtures/packs/vernacular-starter-1.0.0/manifest.json,
    tests/fixtures/packs/broken-pack-wrong/manifest.json,
    .claude/agents/pack-validator.md,
  ]
status: current
updated: 2026-06-16
---

# ADR-0091: Pack on-disk integrity, license policy, and build report

## Status

Accepted, landed. The `vernacular-pack` CLI now checks a pack's files against its
manifest. Three pure modules under `scripts/pack/` carry the work
(`license-policy.mjs`, an extended `manifest-validation.mjs`, and a new
`pack-integrity.mjs`), the CLI composes them, and `build` emits a build report. Two
fixture packs under `tests/fixtures/packs/` exercise the passing and failing paths.

## Context

ADR-0024 landed the Phase 0 scaffold: a pure `validatePackManifest` and a
dependency-injected `vernacular-pack` CLI, both JSDoc-typed ESM under `scripts/pack/`,
checking manifest shape only. It named the missing pieces directly. The manifest's
`contentHash` was validated for shape but never against file bytes, so a manifest
could claim a hash no file matched, name a thumbnail that did not exist, or omit a
per-asset license and still pass. The `build` subcommand did the same shape check as
`validate` and produced no artifact.

The design specification expects more. Section 4.3 ties pack integrity to sha256
content hashes whose claims must match file reality. Section 4.8 says the build
pipeline refuses packs with assets that lack a recognized license and attribution,
and warns for nuanced license cases. ADR-0007 fixes the content-addressing contract
the build is meant to enforce. Issue #173 is the first of three asset-track pieces;
the library browser (#174) and furniture in the 3D preview (#175) build on a pack
format that authors can trust.

## Decision

Grow the scaffold into an integrity and build pipeline in place, with no new
dependency and no build step, keeping the schema as JSDoc-typed ESM under
`scripts/pack/`. The schema still graduates to `core/` as shared TypeScript when the
in-app loader needs one definition (#174), per the ADR-0024 graduation plan; #173 is
a build-time tool with no in-app consumer yet.

Three pure units sit behind dependency-injected seams so every path stays
unit-tested without a real filesystem:

- **License policy (`license-policy.mjs`).** A curated allowlist of
  redistribution-friendly SPDX identifiers (`CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`,
  `MIT`, `Apache-2.0`, and a few more). `recognize`, `isShareAlike`, and
  `isNoRedistribution` are the primitives; `licenseProblems(id)` returns the hard
  errors for one license (unrecognized, or a no-redistribution conflict), and
  `shareAlikeWarning(ids)` returns the non-blocking warning when a share-alike
  license is mixed with others. The full SPDX list is not bundled: a recognized open
  license is the correct gate for a redistributable pack, and a curated set is both
  smaller and the right answer.

- **Manifest contract (`manifest-validation.mjs`, extended).** Per-asset
  `attribution`, `eras`, and `categories` are now required, an optional `sourceUrl`
  is shape-checked when present, and pack-level `eras` and `categories` are required.
  License recognition delegates to the policy module so the manifest check and the
  build share one definition.

- **On-disk integrity (`pack-integrity.mjs`).** `checkPackIntegrity(manifest,
reader)` is pure over an injected `PackReader` port (`dirName`, `listDir`,
  `exists`, `sha256`, `readBytes`). For each asset it confirms `assets/<hash>.glb`
  exists and its sha256 equals the declared `contentHash` (ADR-0007), and that
  `thumbnails/<hash>.webp` exists and begins with a valid WebP signature. It flags
  orphan files no manifest entry references, confirms `LICENSE`, `NOTICE`, and
  `CHANGELOG.md` are present, and confirms the directory basename is
  `<packId>-<version>`. Thumbnails are validated, not generated: baking one from a
  model needs a headless renderer and a heavy dependency, which the specification
  places in a later phase. Authors supply thumbnails; the pipeline checks them.

The CLI composes these. `validate <packDir>` runs the manifest contract and on-disk
integrity together and reports every problem at once; integrity runs whenever the
manifest is shaped well enough to read (an object with an `assets` array), so a
license error and a hash mismatch surface in the same pass. `build <packDir>` runs
the same review and writes a `build-report.json` through an injected sink, kept out
of the immutable pack content as a sibling file: per-asset hashes, a license summary,
and an overall PASS or FAIL. The CLI keeps its exit-code contract (success, an
invalid pack, a usage error, an internal fault) and its injected seams; the real
Node adapters (a manifest reader, a directory-and-file reader, a report writer) are
thin and exported so the integration test drives the CLI with real readers against
the fixture packs.

## Consequences

- A passing `validate` now means an integrity-checked pack, not just a well-shaped
  manifest, closing the gap ADR-0024 flagged.
- Pack authors get one composed report of manifest, license, and on-disk problems,
  with share-alike handled as a warning rather than a block, matching the
  specification's "warns loudly for nuanced cases."
- The build report is the build artifact for now. A zipped, signed distributable is
  deferred until an install path consumes one; `fflate@0.8.2` is already available if
  it is ever needed.
- The pure-plus-injected shape keeps every check unit-tested without a real
  filesystem, and the two fixture packs double as the integration smoke and a manual
  `pnpm pack:validate` / `pnpm pack:build` target.
- The schema graduation to `core/` and thumbnail baking remain future work, recorded
  here and in ADR-0024.

## References

- Design specification, section 4.3 (asset pack format), 4.5 (asset `kind`
  enumeration), 4.8 (license and provenance).
- Feature specification: `docs/specs/2026-06-16-asset-pack-format-and-cli.md`.
- Implementation plan: `docs/plans/2026-06-16-asset-pack-format-and-cli.md`.
- ADR-0007 (content-addressed assets; the `contentHash` the build verifies against
  file bytes).
- ADR-0024 (the manifest validator's location and its graduation plan, which this
  pipeline extends).
