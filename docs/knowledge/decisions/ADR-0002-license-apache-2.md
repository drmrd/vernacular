---
slug: decisions/ADR-0002-license-apache-2
title: 'ADR-0002: Apache-2.0 license throughout the repository'
type: decision
tags: [license, governance]
related: [decisions/ADR-0007-content-addressed-assets]
sourceFiles: [LICENSE, NOTICE, package.json]
status: current
updated: 2026-06-02
---

# ADR-0002: Apache-2.0 license throughout the repository

## Status

Accepted. Implemented in Phase 0a.

## Context

We needed a license that protects contributors from patent claims, accommodates corporate contributors (whose internal compliance teams flag unfamiliar licenses), and stays compatible with the broader open-source ecosystem we intend to draw asset packs from. MIT and BSD are simpler but lack a patent grant; AGPL deters corporate contribution; the Mozilla and Eclipse families are workable but uncommon for browser-first projects.

## Decision

Apache License, Version 2.0, applied uniformly to:

- Source code and configuration in this repository.
- Documentation (specs, plans, knowledge-graph entries).
- Schemas and data formats produced by Vernacular.

Asset packs and registry packs declare their own SPDX licenses in their manifests, which Vernacular enforces at install and export time (see ADR-0007).

## Consequences

- Patent grant from contributors protects downstream users.
- The NOTICE file accumulates required attributions over time.
- Asset packs with incompatible licenses (e.g., GPL) can still be installed if explicitly accepted but cannot be redistributed via a bundle export; the export pipeline refuses those mixes.

## References

- Phase 0a commit: 48000cd (LICENSE, NOTICE created).
- Phase 0a commit 0be9856 (NOTICE org placeholder resolved).
- Design specification, section 1 (Overview), section 4.8 (license enforcement).
