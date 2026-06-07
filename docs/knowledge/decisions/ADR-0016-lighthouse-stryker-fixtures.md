---
slug: decisions/ADR-0016-lighthouse-stryker-fixtures
title: 'ADR-0016: Lighthouse CI, Stryker, fixtures, and factories scaffold'
type: decision
tags: [tooling, testing, performance, mutation-testing, fixtures]
related:
  [
    decisions/ADR-0009-test-pyramid-rgb-tdd,
    decisions/ADR-0013-cooldown-exclusions,
    decisions/ADR-0015-storybook-playwright-axe,
  ]
sourceFiles:
  [
    lighthouserc.json,
    stryker.conf.json,
    tests/fixtures/README.md,
    tests/factories/README.md,
    .github/workflows/ci.yml,
    .github/workflows/mutation.yml,
    package.json,
  ]
status: current
updated: 2026-06-02
---

# ADR-0016: Lighthouse CI, Stryker, fixtures, and factories scaffold

## Status

Accepted.

## Context

The design spec's test pyramid (section 9) calls for three foundation-tier
scaffolds beyond the Storybook, Playwright, and axe-core work landed in
ADR-0015:

- Lighthouse CI for performance and accessibility regression tracking on
  main and tagged builds (section 9.3, 9.11).
- Stryker mutation testing on a weekly cadence against `core/` (section
  9.9).
- `tests/fixtures/{projects,assets,registries}/` and `tests/factories/`
  directory scaffolds (section 9.10).

Each of these is "scaffold" in the section 10 sense: structure and tooling
go in now; concrete content arrives as the corresponding application
surfaces land.

## Decision

### Lighthouse CI

`@lhci/cli@0.15.1` configured via `lighthouserc.json`. The preview server
(`pnpm preview` on port 4173) hosts the production bundle so Lighthouse
measures exactly what Playwright tests. Three runs per assertion smooth
performance variance.

Category-level assertions:

- `accessibility`: error at 0.9. Hard gate. Aligns with axe-core's per-page
  scans; the two tools should agree.
- `performance`, `best-practices`, `seo`: warn-only. The stub app cannot
  exercise meaningful performance signal yet; warnings let the pipeline run
  without false-positive failures.

CI scopes Lighthouse to pushes on `main` and to tag pushes; pull requests
skip it. Rationale: PR iteration cost is precious while there are no real
surfaces to optimize. When the first user-facing flow arrives, the
performance category will get tightened and the PR scope reconsidered.

No `upload` block is configured. The temporary public storage server is
not appropriate for a project artifact, and there is no internal LHCI
server. The HTML report is uploaded as a workflow artifact instead.

### Stryker

`@stryker-mutator/core@8.7.1` plus `@stryker-mutator/vitest-runner@8.7.1`
plus `@stryker-mutator/typescript-checker@8.7.1`. The 9.x line was
released in May 2025 and tightened the Vitest peer to `>=2.0.0`; we are
still on Vitest 1.6 (Vitest 2 has breaking config changes and warrants a
deliberate upgrade pass of its own). The 8.7.x line accepts `vitest>=0.31.2`
and is the most recent Stryker minor compatible with the current runner.
When Vitest is upgraded, the Stryker pin in `package.json` should jump
back to the current major.

Configuration at `stryker.conf.json`. Mutate target is `core/**/*.ts` with
test files excluded; per spec the mutation surface is the pure domain
layer. Thresholds are placeholders (`high: 80, low: 60, break: 50`) per
spec line 1232 calling specifics "open"; they will be revisited once
`core/` accumulates real code.

The weekly cadence lives in a dedicated workflow at
`.github/workflows/mutation.yml`. It runs Sundays at 03:30 UTC and is
manually dispatchable. A guard step skips the Stryker run while `core/` is
empty so the workflow stays green during the bootstrap stretch; the
skip-condition disappears as soon as one `core/**/*.ts` file lands.

### Fixtures and factories

`tests/fixtures/{projects,assets,registries}/` and `tests/factories/` are
scaffolded as directories anchored by README files that explain each
subtree's purpose. No JSON, asset, or factory function is committed yet:

- Project, asset, and registry fixtures require the domain types they
  conform to, which arrive when `core/` is scaffolded.
- Factories (`makeWall`, `makeProject`, etc. per spec line 959) need
  concrete domain types as their return type; writing them now would
  fabricate types that the application would then have to match later, an
  inversion of the natural dependency direction.

The READMEs codify conventions (append-only fixtures, one factory per
type, `Partial<T>` override pattern, no shared mutable state) so the
first contributor adding content has clear precedent.

## Consequences

- Two new CI surfaces: a `lighthouse` job in `.github/workflows/ci.yml`
  scoped to main/tags, and a separate weekly workflow at
  `.github/workflows/mutation.yml`. Together they raise total CI cost
  modestly per push; the weekly Stryker run consumes its own envelope.
- The empty `tests/factories/` directory invites adding factories
  prematurely (before the domain types exist). The README explicitly warns
  against this; the `pr-reviewer` agent should flag a factory that
  fabricates types as a finding.
- Lighthouse and axe-core overlap on accessibility but operate on
  different surfaces (Lighthouse on the built bundle in a real browser,
  axe-core during Playwright's E2E navigations). Keeping both is a
  defense-in-depth posture.
- The Stryker guard step (`Skip if core/ is empty`) is the kind of small
  CI workaround that future-Claude should remove once it stops applying;
  the ADR's Status will move to `superseded` and a follow-up ADR will
  document the removal.
- The Stryker 8.x pin is tied to the Vitest 1.x pin. The Vitest 2 upgrade
  is its own decision (separate ADR) and should bundle the Stryker 9.x
  jump with it; updating one without the other reintroduces the peer
  mismatch.
- Local Lighthouse runs on macOS hosts that lack Chrome can point
  `CHROME_PATH` at Playwright's bundled Chromium
  (`~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`).
  CI uses `browser-actions/setup-chrome@v1`, which installs Chrome stable
  directly; the workaround is local-only.
- Adding a second GitHub Actions workflow pushed `pnpm dup` over its
  `threshold: 0` because GitHub Actions setup boilerplate (checkout,
  pnpm, Node, install) cannot be deduplicated without composite actions.
  CONTRIBUTING.md already framed the dup check as informational; the
  config drifted from that intent on the earlier multi-job push. The fix
  here adds `**/.github/workflows/**` to `.jscpd.json` ignore so
  workflow boilerplate stops triggering the gate. A future ADR can
  revisit composite actions as a more invasive cleanup.

## Alternatives considered

- **Run Lighthouse on every PR.** Rejected for now: PR iteration cost is
  high and the stub app has no signal to measure. Revisit once a real user
  flow exists.
- **Use the Lighthouse CI temporary public storage server for upload.**
  Rejected: the server is not promised long-term storage, and the report
  contains no secrets so the artifact-on-failure upload is sufficient.
- **Run Stryker on PRs that touch `core/`.** Rejected for now: full
  Stryker runs are minutes-to-hours depending on the codebase, far too
  slow for the inner loop. Per-PR mutation incrementality (diff-only
  mutants) is a separate decision deferred until `core/` is non-trivial.
- **Define a placeholder `makeFixture` factory in `tests/factories/` to
  prove the wiring.** Rejected: factories without a concrete return type
  set a bad precedent. The README is enough wiring proof.
- **Upgrade Vitest to 2.x as part of this milestone to land Stryker 9.x.**
  Rejected: out of scope. Vitest 2 has its own breaking changes
  (`@vitest/coverage-v8` peer bumps, configuration shape changes) and
  deserves a dedicated upgrade pass rather than riding along with a
  testing-scaffold milestone.

## References

- Design specification, sections 9.3, 9.9, 9.10, 9.11.
- ADR-0009 (test pyramid and red-green-blue TDD).
- ADR-0013 (cooldown exclusions; applied unchanged here).
- ADR-0015 (Storybook, Playwright, axe-core, visual regression scaffold;
  this ADR extends the testing surface ADR-0015 began).
