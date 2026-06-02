---
slug: decisions/ADR-0003-storage-provider-pattern
title: 'ADR-0003: Provider pattern for storage with cloud-sync seam'
type: decision
tags: [architecture, storage, persistence, opfs]
related: [decisions/ADR-0007-content-addressed-assets, decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0003: Provider pattern for storage with cloud-sync seam

## Status

Accepted. Implementation lands in Phase 0h.

## Context

Vernacular projects must persist locally (no backend required at MVP), survive across browsers that vary in filesystem support, and remain ready to add cloud sync later without rewriting consumers. Browsers offer multiple persistence APIs (File System Access, OPFS, IndexedDB, Service Worker cache) with quirky availability. Hard-coding any one of them paints us into a corner.

## Decision

Three interfaces in `storage/`, each with multiple implementations:

- `ProjectStore`, open, save, lock, watch the active project (`FileSystemFolderProjectStore`, `OPFSProjectStore`, `ZipBundleProjectStore`, future `CloudSyncProjectStore`).
- `LibraryStore`, user library of custom assets, custom palettes, settings.
- `AssetCache`, content-hash keyed cache for the assets the app has fetched or imported.

Consumers (the bridge, editor, and engine layers) interact with the aggregated facades only, never with browser APIs directly.

## Consequences

- Project files can be a folder on disk (best for git interop), an OPFS-only flow (works in all major browsers), or a `.house.zip` bundle (shareable). The user picks per project; switching is supported.
- A future cloud-sync implementation is additive: it plugs into the existing interfaces without consumer changes.
- The interface boundary is the right place to apply policies like multi-tab Web Locks coordination, quota observation, and autosave snapshots.

## References

- Design specification, section 5 (Storage & persistence).
- ADR-0007 (asset references that flow through the same providers).
