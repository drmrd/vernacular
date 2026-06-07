---
slug: decisions/ADR-0024-pack-manifest-validation-location
title: 'ADR-0024: Pack manifest validation in scripts, graduating to core later'
type: decision
tags: [architecture, packs, validation, cli, tooling, build]
related:
  [
    decisions/ADR-0007-content-addressed-assets,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0001-six-layer-architecture,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-03-service-worker-and-pack-cli.md,
    scripts/pack/manifest-validation.mjs,
    scripts/pack/manifest-validation.test.mjs,
    scripts/pack/vernacular-pack.mjs,
    scripts/pack/vernacular-pack.test.mjs,
    tests/fixtures/packs/example-pack/manifest.json,
    package.json,
    .claude/agents/pack-validator.md,
  ]
status: current
updated: 2026-06-03
---

# ADR-0024: Pack manifest validation in scripts, graduating to core later

## Status

Accepted, landed. The pure validator (`validatePackManifest`) lives in
`scripts/pack/manifest-validation.mjs`; the `vernacular-pack` CLI
(`runPackCli` plus a direct-invocation shim) lives in
`scripts/pack/vernacular-pack.mjs`. Both are JSDoc-typed ESM with unit tests and
no build step. They are wired to `pnpm pack:validate` and `pnpm pack:build`
against an example pack at `tests/fixtures/packs/example-pack/`. This satisfies
the Phase 0 deliverable of a pack-format CLI scaffold (design specification,
section 4.3).

## Context

The design specification defines the asset pack format (section 4.3): a
`manifest.json` carrying `packId`, `version`, `license`, `attribution`, era and
category lists, and an `assets[]` array, each asset bearing a `contentHash`,
`name`, `kind`, `dimensions`, license, and attribution. Section 4.5 fixes the
asset `kind` enumeration. Packs are immutable per SemVer version, and integrity
rests on sha256 content hashes whose claims must match file reality. Phase 0
needs a CLI that can validate a manifest against this format so pack authors get
feedback before the in-app loader exists.

The open question is where the schema and validator should live. The eventual
home is `core/`, because the in-app pack loader (Phase 3) and the CLI will share
one definition of "valid manifest," and `core/` is the React-free, Three.js-free
domain layer (ADR-0001) where shared pure logic belongs. But `core/` is still a
placeholder, and standing up TypeScript-compiled domain code, an in-app loader,
and a content-hash verifier is well beyond a Phase 0 scaffold.

## Decision

Land the manifest schema and validator as plain, JSDoc-typed ESM under
`scripts/pack/` for now, and plan to graduate it to `core/` as shared TypeScript
when the in-app pack loader lands in Phase 3.

- **`manifest-validation.mjs` is pure.** `validatePackManifest(manifest)` takes a
  parsed object and returns `{ valid, errors }`. No filesystem, no process, no
  network. It checks the required top-level strings (`packId`, `license`,
  `attribution`, and a SemVer `version`), then each asset: a 64-char sha256 hex
  `contentHash`, a non-empty `name` and `license`, a `kind` drawn from the
  exported `ASSET_KINDS` frozen list (the specification 4.5 enumeration), and
  `dimensions.width/depth/height` that are positive finite millimeters up to a
  100 m ceiling. The ceiling is a deliberately generous sanity bound that still
  catches unit mistakes such as meters entered as millimeters. Errors accumulate
  into a flat list rather than failing fast, so an author sees every problem at
  once.
- **`vernacular-pack.mjs` is dependency-injected.** `runPackCli(argv, deps)` takes
  the args plus a `PackCliDeps` of `{ readManifest, log, error }` and returns a
  numeric exit code, never throwing or touching `process` directly. It accepts
  `validate <packDir>` and `build <packDir>`, returning distinct codes for
  success (0), an invalid or unreadable manifest (1), and a usage error (2). A
  thin direct-invocation shim at the bottom of the file runs the CLI only when
  the module is the process entry (not when a test imports it), reads
  `<packDir>/manifest.json` from disk, and maps an unexpected internal fault to
  exit code 3. Because the deps are injected, the success, invalid, read-failure,
  and usage paths are all unit-tested with no real filesystem.
- **`build` currently equals `validate`.** For this scaffold, `build` runs the
  same validation and reports a summary. The real build pipeline (content-hash
  verification against file reality, thumbnail baking, publishing) is Phase 3.
- **Why `scripts/` and not `core/` yet.** Plain ESM with JSDoc types runs under
  Node directly, adds zero dependencies (honoring the cooldown invariant by not
  adding any), and needs no compile step in CI for a Phase 0 tool. Putting it in
  `core/` now would force premature TypeScript-build wiring for the domain layer
  before any in-app consumer exists.

A `pack-validator` subagent (`.claude/agents/pack-validator.md`) lands alongside
the tooling to drive pack validation tasks.

## Graduation plan

When the in-app pack loader lands in Phase 3, the schema and validator move to
`core/` as shared TypeScript, and both the CLI and the loader import the single
definition. The validator's shape (pure function, parsed input, flat error list)
is already loader-friendly, so graduation is a port plus a type translation of
the JSDoc typedefs, not a redesign. The CLI keeps its dependency-injection seam
and simply calls the relocated validator. At that point `build` grows the real
pipeline: hashing files to confirm manifest `contentHash` claims match reality
(ADR-0007), baking thumbnails, and producing a publishable, immutable
versioned pack.

## Consequences

- Pack authors get manifest feedback in Phase 0 with no new dependencies and no
  build step, and the example pack doubles as a fixture and a smoke target for
  `pnpm pack:validate` / `pnpm pack:build`.
- Because the validator is pure and the CLI is dependency-injected, both are
  exhaustively unit-tested without a real filesystem, matching the project's
  preference for injected seams over environment-coupled tests.
- The deliberate `scripts/` location is a known, documented temporary home, not a
  layer violation: the validator carries no React or Three.js coupling and is
  written to move into `core/` unchanged in spirit. Future work that needs
  manifest validation before Phase 3 should import this module rather than
  forking a second schema.
- The content-hash check is intentionally absent today; the manifest's
  `contentHash` is validated only for shape, not against file bytes. Treating a
  validated manifest as integrity-checked is therefore wrong until the Phase 3
  build pipeline lands.

## References

- Design specification, section 4.3 (asset pack format), section 4.5 (asset
  `kind` enumeration), section 4.8 (license and provenance).
- Implementation plan: `docs/plans/2026-06-03-service-worker-and-pack-cli.md`.
- Example pack fixture: `tests/fixtures/packs/example-pack/manifest.json`.
- ADR-0007 (content-addressed assets; the `contentHash` the Phase 3 build will
  verify against file reality).
- ADR-0006 (the registry pattern that consumes pack-declared types downstream).
- ADR-0001 (the six-layer architecture; `core/` is the intended graduation home).
