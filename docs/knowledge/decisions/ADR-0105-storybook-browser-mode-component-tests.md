---
slug: decisions/ADR-0105-storybook-browser-mode-component-tests
title: 'ADR-0105: Storybook stories as browser-mode component tests'
type: decision
tags: [tooling, testing, storybook, vitest, browser, accessibility, ci, dependencies, cooldown]
related:
  [
    decisions/ADR-0100-vitest-3-vite-6-test-stack,
    decisions/ADR-0013-cooldown-exclusions,
    decisions/ADR-0016-lighthouse-stryker-fixtures,
    decisions/ADR-0096-design-system-consolidation,
  ]
sourceFiles:
  [
    vitest.config.ts,
    vite.config.ts,
    package.json,
    pnpm-lock.yaml,
    .storybook/main.ts,
    .storybook/preview.ts,
    .github/workflows/ci.yml,
    eslint.config.js,
    app/app.stories.tsx,
    editor/design-system/button.stories.tsx,
  ]
status: current
updated: 2026-06-19
---

# ADR-0105: Storybook stories as browser-mode component tests

## Status

Accepted, landed. Storybook stories now run as isolated component tests in a real
browser. The harness adds `@storybook/addon-vitest` and `@storybook/addon-a11y`,
splits the Vitest configuration into a jsdom unit project and a Storybook browser
project, gates accessibility through axe-core, and runs the story tests in CI. This
record amends one forecast in ADR-0100: the harness lands on the Vitest 3 that
ADR-0100 already installed, not on Vitest 4.

## Context

ADR-0100 upgraded the unit runner to Vitest 3.2.4 and added `@vitest/browser` 3.2.4
specifically so this harness could begin. Until now the pieces were half in place.
Storybook 10.4.0 built in CI, but `.storybook/main.ts` registered no addons, the
story globs skipped the `bridge` layer, and the workflow ran `build-storybook`
without ever executing a story. The one test that referenced the stories read the
story file as text and matched a substring, so it checked an export name rather than
a rendered component. Stories were documented but never asserted.

The goal here is narrow: turn stories into tests. A story should mount in a browser,
its `play` interactions should run, and an accessibility check should have a way to
fail the build. The broader story backfill, network mocking, and visual regression
are separate follow-on work and are deliberately out of scope.

## Decision

Stand up the browser-mode harness on the installed Vitest 3 stack, add the two
Storybook test addons, and wire the story tests into the local gate and CI.

### Stay on Vitest 3, against ADR-0100's forecast

ADR-0100 expected this change to carry a second major bump from Vitest 3 to Vitest 4,
on the reading that `@storybook/addon-vitest` needs `@vitest/browser-playwright`,
which only exists on the 4.x line. Reading the published package metadata for
`@storybook/addon-vitest` 10.4.0 reverses that expectation. The addon declares its
`vitest`, `@vitest/runner`, `@vitest/browser`, and `@vitest/browser-playwright` peers
all as optional, and its `vitest` peer range accepts `^3.0.0 || ^4.0.0`. The
`@vitest/browser-playwright` package is the 4.x split-out of a provider that the
already-installed `@vitest/browser` 3.2.4 still ships in-package. So Vitest 3 browser
mode configures the provider the legacy way, with `browser: { provider: 'playwright' }`,
and never needs the separate 4.x package.

This was confirmed by running a story end to end before committing to the approach: a
design-system story mounted in chromium and its `play` assertion passed under Vitest
3.2.4. Staying on 3 keeps this change a tooling-config addition rather than a second
test-stack migration landing days after the first. It also avoids re-touching the
`package.json`, `vite.config.ts`, and `app/app.test.tsx` that ADR-0100 just
stabilized. The Vitest 4 move is no longer tied to this work; it can happen on its own
merits whenever a concrete need arrives.

### The two addons, pinned at 10.4.0

`@storybook/addon-vitest` and `@storybook/addon-a11y` are both pinned at exactly
10.4.0 to match the installed Storybook minor and to clear the 30-day install
cooldown. 10.4.0 was published on 2026-05-14, comfortably older than the cutoff; every
later patch from 10.4.1 onward is too young to install. The install was run surgically
with `--config.prefer-frozen-lockfile=true --config.minimumReleaseAge=0`, the same
pattern ADR-0100 used, and the lockfile diff was checked to confirm only the two
intended keys and their pinned transitives moved. Both addons resolved their optional
peers against the existing `@vitest/browser` 3.2.4, which is the install-time evidence
for the Vitest 3 decision above.

### A Vitest projects split that preserves the jsdom unit project

The browser story tests run in chromium, so they cannot share the single jsdom `test`
block that the unit suite uses. A new `vitest.config.ts` declares two projects. The
first is the jsdom unit project, expressed as `{ extends: './vite.config.ts', test: {
name: 'unit' } }`, so it inherits the existing environment, setup file, exclude list,
and coverage block without restating them. The second is the Storybook browser project,
which adds the addon's `storybookTest` plugin and a Playwright chromium browser instance.

`vite.config.ts` is left byte-identical. Stryker reads it directly through
`stryker.conf.json`, and the unit project extends it rather than replacing it, so the
mutation runner still resolves the same `test` block it always did. The package scripts
keep the two runtimes apart: `test` becomes `vitest run --project unit`, which stays
jsdom-only and needs no browser, and a new `storybook:test` runs
`vitest run --project storybook`. The unit run stays at the same shape and count it had
before, minus the one placeholder test that this change retired.

The browser project needs no explicit setup file. Since Storybook 10.3,
`@storybook/addon-vitest` applies the preview annotations and the registered addon
annotations to the browser project on its own, so a hand-written
`setProjectAnnotations` setup file would be redundant and the addon prints a note
saying as much.

### Accessibility runs as a gate, defaulting to report-only

The a11y addon runs axe-core against every story during the browser test. The global
default in `.storybook/preview.ts` is `a11y: { test: 'todo' }`, which reports
violations without failing, so the suite stays green while the story set is still
small and unaudited. A story that should hold a hard line opts in with
`parameters: { a11y: { test: 'error' } }`, and any axe violation then fails that
story's test. The example gate was checked both ways: an accessible button passes, and
a button stripped of its accessible name fails on the axe `button-name` rule, which
confirms the gate actually gates rather than passing silently.

### The full-application shell stories stay out of the component run

`app/app.stories.tsx` mounts the entire application, including the WebGPU scene, and
replays the same draw-a-wall flow the end-to-end suite already covers. Those stories
are tagged `['!test']` so the browser component run skips them. The harness stays
focused on isolated components, the run stays fast, and the heavy integration flow
keeps living in the Playwright suite where it belongs.

### The CI job runs the story tests

The old Storybook job only built the static site. The job now installs the chromium
browser and runs
`pnpm storybook:test` before building the static Storybook. It reuses the same
Playwright chromium step the end-to-end job already depends on. The local gate runs
the same `pnpm storybook:test`, so the behavior is verifiable without a CI runner,
which matters while Actions minutes are constrained.

## Consequences

- Stories are now a test surface. A story file is both documentation and a component
  test: its render is asserted, its `play` runs, and it can gate on accessibility. The
  one source-string placeholder test is gone, replaced by the real browser render of
  the showcase story it used to approximate.
- The example story set added for this harness is intentionally minimal: one Button
  story for render, one for a click interaction, and one for the accessibility gate.
  Backfilling stories across the component library is a separate follow-on, as is
  network mocking and visual regression, and each shares files with this harness, so
  they are sequenced after it rather than alongside.
- Coverage from the browser project is not yet folded into the v8 unit report. The
  unit coverage is unchanged and the story tests run as a separate project; merging the
  two coverage streams is left for later and is not required for the harness to be
  useful.
- The Vitest 4 move is decoupled from Storybook. ADR-0100 tied that bump to this work;
  it is now free of it. Whenever Vitest 4 is taken up, it is its own change with its
  own justification, and `@vitest/browser-playwright` comes in only if a future need
  actually requires it.
- Mutation testing is unaffected. `vite.config.ts` is byte-identical, so the Stryker
  config resolution that ADR-0100 documented as already locally broken for an unrelated
  reason is neither helped nor worsened here.

## References

- ADR-0100 (the Vitest 3 and Vite 6 test-stack upgrade that this harness builds on,
  and whose Vitest 4 forecast this record amends).
- ADR-0013 (the 30-day cooldown policy that the addon pins and the surgical install
  honor).
- ADR-0016 (the Lighthouse and Stryker fixtures; the Stryker config that the preserved
  `vite.config.ts` keeps resolvable).
- ADR-0096 (the design-system consolidation whose primitives the example stories
  exercise).
