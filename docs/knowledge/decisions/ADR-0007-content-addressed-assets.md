---
slug: decisions/ADR-0007-content-addressed-assets
title: 'ADR-0007: Content-addressed asset references'
type: decision
tags: [architecture, assets, references, integrity, supply-chain]
related: [decisions/ADR-0003-storage-provider-pattern, decisions/ADR-0006-registry-pattern]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0007: Content-addressed asset references

## Status

Accepted. Implementation lands in Phase 0f.

## Context

A project references many external pieces (furniture models, underlay images, paint palettes). Sharing a project should not break references; renaming an asset, switching pack versions, or moving a custom model between machines should resolve gracefully. Path-based references fail all three. Hash-based references (`sha256:...`) work but make project files opaque.

## Decision

Every asset reference is the pair `(scope, contentHash)`:

- `scope` is one of `pack:<id>@<version>` (a curated or community pack), `user` (the user's personal library), or `project` (embedded in this project's `assets/`).
- `contentHash` is a sha256 over the asset bytes.

The `AssetRegistry` aggregates all sources and resolves a reference with graceful degradation: exact match first, then hash match in any other source, then pack-version fallback, then a clearly-labeled placeholder with the correct footprint so editing continues.

## Consequences

- Renaming a pack does not break projects.
- A user who imports a custom model and shares the project carries that model along (it lives in `project` scope), so the recipient gets the same scene.
- Deduplication is automatic. If two packs ship the same hash, the cache stores it once.
- License and attribution travel with the source record. The export pipeline can audit them without parsing the project.

## References

- Design specification, section 4.2 (Resolution precedence and fallback) and 4.3 (Asset pack format).
- ADR-0003 (storage providers, where references live).
