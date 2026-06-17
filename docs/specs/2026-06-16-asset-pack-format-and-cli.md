# Asset pack format and build CLI

Date: 2026-06-16

## Problem

The asset pack format has a working scaffold but not a working contract. The
`vernacular-pack` CLI can read a `manifest.json` and check the shape of its
fields: the top-level `packId`, `version`, `license`, and `attribution`, and for
each asset a content hash, name, kind, license, and dimensions. That is where it
stops. The `build` subcommand does the same shape check as `validate` and
reports a summary. Nothing reads the files a manifest points at, so a manifest
can claim a content hash that no file matches, name a thumbnail that does not
exist, or omit a license on an asset and still pass.

The design specification (section 4.3) is explicit that pack integrity rests on
sha256 content hashes "whose claims must match file reality," that thumbnails are
baked at pack-build time, and that the build pipeline "refuses to publish packs
with assets lacking a recognized SPDX license and attribution string" (section
4.8). ADR-0007 fixes the content-addressing contract the build is meant to
enforce. ADR-0024 records the scaffold as a Phase 0 deliverable and names the
missing pieces directly: content-hash verification against file reality,
thumbnail handling, license and provenance enforcement, and a real build
artifact. Until those land, a validated manifest is not an integrity-checked
pack, and pack authors get no feedback on the half of the format that lives on
disk.

This is issue #173. It is the first of three asset-track pieces: the library
browser and custom import (#174) and furniture in the 3D preview (#175) build on
a pack format that authors can trust.

## Approach

Grow the existing scaffold into an integrity and build pipeline, keeping it where
it already lives. The schema and validator stay plain JSDoc-typed ESM under
`scripts/pack/`, with no new dependency and no build step, exactly as ADR-0024
set up. The schema graduates to `core/` as shared TypeScript in #174, when the
in-app library loader is the consumer that needs to share one definition. This
piece is a build-time tool with no in-app consumer yet, so graduating it now
would force premature TypeScript-build wiring for a tool that runs fine under
Node directly.

The work splits into three pure units behind dependency-injected seams, so every
path stays unit-tested without a real filesystem, matching the project's
preference for injected seams over environment-coupled tests.

1. **Manifest contract.** Extend `manifest-validation.mjs` to close the gaps the
   specification names but the scaffold skips: a per-asset `attribution` string
   (section 4.8 requires it on every asset record, not just the pack), the
   `eras` and `categories` arrays the format declares (section 4.3), and an
   optional `sourceUrl` validated for shape when present. License recognition
   moves into its own small module so both the manifest check and the build can
   share one policy.

2. **License policy.** A curated allowlist of redistribution-friendly SPDX
   identifiers (for example `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `MIT`,
   `Apache-2.0`). An unrecognized identifier is an error. A share-alike license
   such as `CC-BY-SA-4.0` mixed with others raises a warning that does not block,
   matching the specification's "warns loudly for nuanced cases" language. A
   license the policy marks as no-redistribution is a hard conflict that blocks,
   matching "refuses for clear conflicts." The full SPDX list is not bundled; the
   specification asks for a recognized license, and a curated open-license set is
   both smaller and the correct gate for a redistributable asset pack.

3. **On-disk integrity.** A new `pack-integrity.mjs`, pure over a directory
   listing and a file-hashing port, verifies what the manifest claims against
   what the directory holds. For each asset it confirms an `assets/<hash>.glb`
   exists and that the sha256 of its bytes equals the declared `contentHash`
   (ADR-0007), and that a `thumbnails/<hash>.webp` exists and begins with a valid
   WebP signature. It flags any asset file or thumbnail on disk that no manifest
   entry references. It confirms `LICENSE`, `NOTICE`, and `CHANGELOG.md` are
   present, and that the pack directory's own name is `<packId>-<version>`.
   Thumbnails are validated, not generated: baking a thumbnail from a model needs
   a headless render step and a heavy dependency, which the specification places
   in a later phase. Authors supply thumbnails; the pipeline checks them.

The CLI composes these. `validate <packDir>` runs the manifest contract and the
on-disk integrity check read-only and reports every problem at once. `build
<packDir>` runs the same checks and, when they pass, writes a `build-report.json`
through an injected report sink, kept out of the immutable pack content: the
verified content hash of each asset, a license summary across the pack, and an
overall PASS or FAIL. The report is the build artifact for now. A zipped
distributable is deferred until the install path that would consume one exists. The CLI keeps its injected dependencies (a manifest
reader, a directory lister, a file hasher, a report writer, and log and error
sinks) and its exit-code contract: success, an invalid pack, a usage error, and
an unexpected internal fault.

Two fixture packs land under `tests/fixtures/packs/` so the integrity and build
paths have real bytes to work on: one well-formed pack with small real asset and
thumbnail files whose hashes match its manifest, and one deliberately broken pack
that exercises the failure paths (a content-hash mismatch, a missing thumbnail,
an unrecognized license, an orphan file, a wrong directory name).

## Scope

- Extend `scripts/pack/manifest-validation.mjs`: per-asset `attribution`,
  `eras`, `categories`, optional `sourceUrl`, delegating license checks to the
  policy module.
- Add `scripts/pack/license-policy.mjs`: the recognized open-license allowlist,
  with `recognize`, `isNoRedistribution`, and share-alike detection, returning
  errors and warnings.
- Add `scripts/pack/pack-integrity.mjs`: content-hash verification, asset and
  thumbnail presence, orphan detection, required-file presence, and directory
  naming, pure over an injected listing and hasher.
- Extend `scripts/pack/vernacular-pack.mjs`: compose manifest, license, and
  integrity checks into `validate`; add the `build-report.json` write to `build`;
  widen the injected dependency set; preserve the exit-code contract.
- Add the two fixture packs and their assets, thumbnails, and required files.
- Refresh `.claude/agents/pack-validator.md` to the graduated contract and add an
  ADR recording the integrity and build pipeline.

## Deferred, by design

- Graduating the schema and validator to `core/` as shared TypeScript. That rides
  with #174, when the in-app loader is the shared consumer.
- Baking thumbnails from models at build time. Needs a headless renderer and a
  heavy dependency; a later phase per the specification.
- A zipped, signed, publishable distributable. Ed25519 signing is a later
  hardening, and no install path consumes a packaged artifact yet.
- The aggregating `AssetRegistry` and resolution-with-fallback. That is a runtime
  concern for the asset cache and the library, not the build tool.

## Verification

- New and extended unit tests under `scripts/pack/*.test.mjs` cover each manifest
  field, each license-policy outcome (recognized, unrecognized, share-alike
  warning, no-redistribution block), and each integrity outcome (hash match and
  mismatch, missing and present thumbnail, orphan file, missing required file,
  directory-name match and mismatch), all through injected seams with no real
  filesystem.
- Running `pnpm pack:validate` against the well-formed fixture pack exits 0;
  running it against the broken fixture exits 1 and reports every distinct
  problem.
- Running `pnpm pack:build` against the well-formed fixture pack writes a
  `build-report.json` whose per-asset hashes match the fixture and whose overall
  status is PASS.
- The full check chain stays green: typecheck, lint, format, the unit suite, and
  build.
