---
slug: decisions/ADR-0013-cooldown-exclusions
title: 'ADR-0013: Cooldown exclusions for coordinated-release monorepos and native binaries'
type: decision
tags: [supply-chain, dependencies, pnpm, security, exclusions]
related: [decisions/ADR-0010-dependency-cooldown]
sourceFiles: [.npmrc, package.json]
status: current
updated: 2026-06-02
---

# ADR-0013: Cooldown exclusions for coordinated-release monorepos and native binaries

## Status

Accepted. Implemented in Phase 0d.1 as the lint-expansion install hit the cooldown's interaction with re-resolved transitive dependencies.

## Context

ADR-0010 set a 15-day dependency cooldown across all direct and transitive dependencies. The first time we tried to add new dev dependencies under the policy (`eslint-plugin-boundaries`, `eslint-plugin-unused-imports`, `jscpd`) pnpm refused the resolution repeatedly. Each refusal pointed at a different transitive package whose latest matching version was within the cooldown window:

1. `@rollup/rollup-freebsd-arm64@4.61.0` (published the day prior). Rollup's per-platform native binaries release as a coordinated set when rollup ships; even native-binary packages for platforms we do not use (FreeBSD, Linux PPC64, etc.) appear in the lockfile because they are listed as optional dependencies of `rollup`. The cooldown check fires on every one.
2. `@typescript-eslint/eslint-plugin@8.60.2-alpha.1` (a canary release published hours earlier). pnpm's resolver, when offered a `canary` dist-tag that satisfies the range, evaluates that canary against the cooldown.
3. `@babel/helper-validator-identifier@7.29.7` (published 8 days earlier). Babel internal helpers release in coordinated batches when the Babel core team ships; any one of them being too new blocks a transitive resolution.

The cooldown's intent (catch malicious releases from a compromised maintainer account within the highest-risk first-days window) does not apply with the same force to these three categories. All three are:

- Multi-maintainer monorepos with documented release processes and reviewer requirements (Babel core team, the typescript-eslint maintainers, the rollup team).
- Released in lock-step, where the "package" is really a slice of a larger build artifact rather than independent code.
- Not vectors for the typical compromised-maintainer attack pattern (a lone npm maintainer's credentials leaking, a typosquat sneaking onto the registry).

Enforcing the cooldown on each individual package in these monorepos converts the policy from a useful supply-chain guard into a continuous source of friction with no commensurate security benefit.

## Decision

Add three categories of packages to `minimum-release-age-exclude` in `.npmrc`:

### Rollup per-platform native binaries

Every package matching `@rollup/rollup-*` is excluded. These are pre-built native artifacts emitted by rollup's CI, not separate codebases. The full list (25 packages as of rollup 4.61.0) is enumerated explicitly in `.npmrc` because pnpm's `minimum-release-age-exclude` does not accept glob patterns; the list is maintained when rollup adds a new platform binary (rare).

### typescript-eslint monorepo

The nine `@typescript-eslint/*` and `typescript-eslint` packages are excluded. The monorepo's governance is documented; canary releases are part of the normal cadence and should not block CI installs.

### Babel infrastructure

Twenty-two `@babel/*` packages covering the parser, traverse, helpers, and core are excluded. These are utility packages with no business logic; the babel team's release process is well-documented.

## What is NOT excluded

- Any direct dependency we declare (the cooldown's primary guard).
- Any random transitive package outside the three categories above. New transitives that block install force an explicit decision (add to ADR or pin an older direct dependency).
- ESLint plugins, formatters, build tools, and similar single-purpose packages (each carries independent maintainer risk).

## Consequences

- `pnpm add` succeeds for normal additions to the project without ad-hoc friction.
- The cooldown still bites where it should (direct dependencies, single-purpose transitive packages).
- The exclusion list is reviewed when an ADR is opened to add a new entry.
- A new compromised release in one of the excluded categories would slip through the cooldown. We rely on the monorepo maintainers' own review processes and the broader ecosystem's quick yanking. The residual risk is judged acceptable given the friction cost of the alternative.

## How to extend

Adding a new package to the exclusion list requires:

1. Identifying the package category (coordinated-release monorepo, native binary set, or similar low-independent-risk pattern).
2. Updating this ADR with the addition and the justification.
3. Adding the lines to `.npmrc`.

Single-purpose npm packages do not qualify for exclusion. If a single-purpose package's recent release is blocking install, pin to an older version of the direct dependency that does not pull the new transitive, or wait the cooldown out.

## References

- ADR-0010 (the original cooldown decision).
- pnpm setting reference: `minimum-release-age-exclude`.
- The first concrete trigger: the Phase 0d.1 install of `eslint-plugin-boundaries`, `eslint-plugin-unused-imports`, and `jscpd`.
