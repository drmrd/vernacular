---
slug: decisions/ADR-0010-dependency-cooldown
title: 'ADR-0010: 15-day minimum release age for dependencies'
type: decision
tags: [supply-chain, dependencies, pnpm, security]
related: [decisions/ADR-0002-license-apache-2]
sourceFiles: [.npmrc, package.json, docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0010: 15-day minimum release age for dependencies

## Status

Accepted. Implemented in Phase 0b.1.

## Context

Recent npm and PyPI incidents (compromised maintainer accounts, malicious dependency confusion attacks, post-install scripts mining the wallet of CI runners) share a pattern: the bad package is published, ships for a few hours or days, gets caught, and is yanked. Projects that hold off on updates for a few days rarely see the bad version. Vernacular has no immediate need to chase fresh-published patch releases, so a cooldown is cheap insurance.

## Decision

`.npmrc` sets `minimum-release-age=21600` minutes (15 days). pnpm 10 honors this setting and refuses to install any direct or transitive dependency whose newest matching version is younger than that. The version pinned in `packageManager` is `pnpm@10.33.4`, itself older than 15 days at the time of adoption.

No exclusions are maintained. `minimum-release-age-exclude` is available if we ever need to bypass the cooldown for a specific trusted package, but the bar is high: an entry in that list is an explicit ADR.

## Consequences

- Adding a brand-new dependency requires waiting 15 days, choosing an older version, or filing an ADR adding the package to the exclusion list. The most common case is choosing the prior patch version.
- Renovate/Dependabot bumps need to respect the same window when they land. We will configure their schedule to match in Phase 0d.
- Cooldown is enforced at install time both locally and in CI (CI re-runs `pnpm install --frozen-lockfile`), so PRs that attempted to bypass cooldown locally would still be caught.

## References

- pnpm settings reference: `minimum-release-age`.
- Design specification, section 8.5b (Dependency cooldown).
- The cooldown was demonstrated working by an attempt to install pnpm 11.5.1 (published the same day) being refused.
