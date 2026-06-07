---
slug: decisions/ADR-0022-storage-capability-detection
title: 'ADR-0022: Read-only storage capability detection behind an injectable host'
type: decision
tags: [architecture, storage, persistence, opfs, indexeddb, capability-detection]
related:
  [
    decisions/ADR-0003-storage-provider-pattern,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0023-service-worker-scaffold,
    decisions/ADR-0030-additive-storage-capabilities,
  ]
sourceFiles:
  [
    docs/specs/2026-06-01-vernacular-design.md,
    docs/plans/2026-06-03-storage-capability-detection.md,
    storage/storage-capabilities.ts,
    storage/storage-capabilities.test.ts,
    storage/index.ts,
    app/app.tsx,
    e2e/tests/storage-capabilities.spec.ts,
    eslint.config.js,
  ]
status: current
updated: 2026-06-03
---

# ADR-0022: Read-only storage capability detection behind an injectable host

## Status

Accepted, landed. The probe (`probeStorageCapabilities`), the derived helpers
(`isStorageDegraded`, `summarizeStorageCapabilities`), and their unit tests live
in `storage/storage-capabilities.ts`. The three functions plus the
`StorageCapabilities` and `StorageProbeHost` types are barrel-exported from
`storage/index.ts`. The app composition root warns once at mount on a degraded
environment (`app/app.tsx`). Cross-browser reachability of OPFS and IndexedDB is
verified by `e2e/tests/storage-capabilities.spec.ts`, which satisfies the
Phase 0 deliverable "OPFS and IndexedDB verified accessible across target
browsers" (design specification, section 10).

## Context

Browsers vary in which durable-storage primitives they expose (OPFS, IndexedDB,
File System Access) and whether storage has been granted persistence. ADR-0003
defines the provider pattern that will sit on top of those primitives, but
Phase 0 needs a faithful, narrow slice: detect what the platform offers, verify
OPFS and IndexedDB are reachable across target browsers, and warn once when the
environment cannot persist projects durably. The durable stores themselves
(`OPFSProjectStore`, `FileSystemFolderProjectStore`, `ZipBundleProjectStore`)
are Phase 1, and the service worker scaffold belongs to the next foundation
milestone, so this work is deliberately detection-only.

Section 5.10 of the design specification calls for "detect and warn" on
ephemeral environments (Safari private browsing). A reliable test for private
browsing does not exist, so the spec's intent is served by observing concrete
capabilities rather than guessing the browsing mode.

## Decision

Add one pure module, `storage/storage-capabilities.ts`, that performs
dependency-injected feature detection and resolves a flat, serializable record.

- `probeStorageCapabilities(host?)` reads from a `StorageProbeHost` that defaults
  to `globalThis` but is injectable, so tests supply fabricated hosts. It is the
  single seam in the codebase that reads browser storage globals for detection,
  keeping the "browser storage APIs live in `storage/`" invariant (ADR-0003)
  intact.
- The output `StorageCapabilities` is a plain record:
  `{ opfs, indexedDb, fileSystemAccess, persisted, estimatedQuotaBytes }`. Each
  field is a boolean except the nullable `estimatedQuotaBytes: number | null`.
  Flat and serializable so it can cross any boundary and be logged or surfaced
  later without translation.
- The probe is read-only. It calls `navigator.storage.persisted()` and
  `estimate()`, but never `persist()`. Requesting persistence is a Phase 1
  first-save concern, not a detection concern, so it stays out of this seam.
- Two pure helpers derive from the record in the same module:
  `isStorageDegraded(capabilities)` is true iff neither OPFS nor IndexedDB is
  available, and `summarizeStorageCapabilities(capabilities)` renders a one-line
  ASCII summary. The probe is also resilient: a rejected `persisted()` or
  `estimate()` falls back to `false` / `null` rather than throwing, so the boot
  path never fails on a flaky storage manager.
- The app composition root invokes a module-level `warnIfStorageDegraded` helper
  from a once-at-mount `useEffect`; it probes and `console.warn`s the summary
  only when storage is degraded (`app/app.tsx`). The effect has an empty
  dependency array because storage capabilities are a fixed property of the host
  environment, not of any prop. `console.warn` is chosen over `console.info`
  because the ESLint `no-console` allowlist permits only `warn` and `error`
  (`eslint.config.js`, `'no-console': ['warn', { allow: ['warn', 'error'] }]`).

## Why fully unit-tested, unlike the durable stores

`IndexedDbProjectStore` (ADR-0003) is e2e-only because jsdom does not implement
IndexedDB, so its single thin adapter is validated by an end-to-end spec. The
capability probe is the opposite: because the host is injected, both the
available and the unavailable branches are covered by unit tests that pass fake
hosts (`storage/storage-capabilities.test.ts`). Cross-browser reachability of
OPFS and IndexedDB is additionally verified by a Playwright spec
(`e2e/tests/storage-capabilities.spec.ts`), which loads the app and asserts both
primitives are present in each target browser (chromium, firefox, webkit), the
part that cannot be exercised in jsdom.

## Deliberate exclusions

- No private-browsing or ephemeral heuristic. Detecting private browsing is
  unreliable, so the probe reports only concrete capabilities. Consumers infer
  "likely ephemeral" later from `persisted === false` combined with a small
  `estimatedQuotaBytes`.
- No UI surface in this milestone. No banner, no recovery flow, no quota-warning
  UI. Those are Phase 1 (and ride on the durable stores). The degraded path
  surfaces only as a boot-time `console.warn`.
- No durable `ProjectStore` and no service worker. Those remain Phase 1 and the
  Service-worker-plus-pack-CLI milestone respectively.

## Consequences

- The provider pattern (ADR-0003) gains a clean, well-tested detection seam it
  can build on without each durable store re-probing the platform.
- Because the output is flat and serializable, future surfaces (a first-save
  persistence request, a quota-warning banner, telemetry) consume the same
  record without coupling to browser globals.
- The injectable host keeps `storage/` free of any layer-upward dependency and
  preserves the `storage -> core` direction enforced by the boundary fitness
  test (ADR-0017).

## References

- Design specification, section 5.2 (storage primitives by job), section 5.10
  ("detect and warn"), section 10 (Phase 0 deliverable).
- Implementation plan: `docs/plans/2026-06-03-storage-capability-detection.md`.
- Acceptance spec: `e2e/tests/storage-capabilities.spec.ts` (OPFS and IndexedDB
  reachable across target browsers). The roadmap "Storage scaffolds (OPFS,
  IndexedDB, File System API)" foundation row is now marked done.
- ADR-0003 (the provider pattern this detection seam feeds).
- ADR-0017 (the boundary fitness test that keeps `storage` from importing
  upward).
