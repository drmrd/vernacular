---
slug: decisions/ADR-0100-vitest-3-vite-6-test-stack
title: 'ADR-0100: Upgrade the test stack to Vitest 3 and Vite 6'
type: decision
tags: [tooling, testing, vitest, vite, coverage, dependencies, cooldown, storybook, build]
related: [decisions/ADR-0013-cooldown-exclusions, decisions/ADR-0016-lighthouse-stryker-fixtures]
sourceFiles:
  [package.json, pnpm-lock.yaml, vite.config.ts, app/app.test.tsx, .npmrc, stryker.conf.json]
status: current
updated: 2026-06-18
---

# ADR-0100: Upgrade the test stack to Vitest 3 and Vite 6

## Status

Accepted, landed. The unit-test stack moves from Vitest 1.6.1 to 3.2.4, the
matching `@vitest/coverage-v8` moves with it, `@vitest/browser` 3.2.4 is added as a
dev dependency, and Vite moves from 5.4.21 to 6.4.2. These four pins move together
in one change because they are a single coupled upgrade, not four independent ones.

## Context

The project ran on Vitest 1.6.1 with `@vitest/coverage-v8` 1.6.1 and Vite 5.4.21.
That stack is the blocker under several pieces of planned work. The Storybook
stories-as-tests path runs through `@storybook/addon-vitest` in browser mode, which
depends on `@vitest/browser`, and both require Vitest 3 or newer. So the Storybook
component-test harness and the broader Storybook effort cannot begin until the unit
runner has crossed the major-version line.

Two couplings forced the scope. First, the Vitest packages move as a set:
`vitest`, `@vitest/coverage-v8`, and `@vitest/browser` share an exact peer pin, so
the runner and its coverage and browser siblings have to land on the same version
in the same step. Second, Vitest 1.x peer-requires Vite ^5, so the runner could not
advance without Vite advancing too. That folds in the long-deferred Vite 5 to 6
advisory bump, which had been waiting on the dependency cooldown to clear. The two
bumps were never separable; trying to split them would have left an unsatisfiable
peer graph at every intermediate point.

A second decision sat inside the version choice: Vitest 3 or Vitest 4. The
Storybook addon's full peer set is only satisfiable on Vitest 4, because it also
wants `@vitest/browser-playwright`, which exists only on the 4.x line. But nothing
the project ships today needs 4.x, and the addon is not installed yet. Going to 4
now would widen the migration surface and pull in a second major-version jump
before anything consumes it.

## Decision

Land Vitest 3.2.4 and Vite 6.4.2 now, and defer the move to Vitest 4 to the change
that actually installs the Storybook addon.

Version targets, each the newest stable release of its package that is itself older
than the 30-day install cooldown (the cutoff at the time of this change was
2026-05-19):

| Package               | From   | To    |
| --------------------- | ------ | ----- |
| `vitest`              | 1.6.1  | 3.2.4 |
| `@vitest/coverage-v8` | 1.6.1  | 3.2.4 |
| `@vitest/browser`     | absent | 3.2.4 |
| `vite`                | 5.4.21 | 6.4.2 |

Packages held at their current pins because they already satisfy the new peer
graph: `@vitejs/plugin-react` 4.7.0 (peers Vite ^6), `jsdom` 24.1.3 (Vitest 3 peers
any jsdom), and `@stryker-mutator/vitest-runner` 8.7.1 (peers Vitest >= 0.31.2).
The Vitest 3.2.5 and 3.2.6 patches and the Vite 6.4.3 patch were all published
after the cutoff and are too young to install, so 3.2.4 and 6.4.2 are the newest
eligible pins, not an arbitrary stopping point.

The `pnpm.overrides` for `rollup` (4.60.4) and `esbuild` (0.25.0) were rechecked
against Vite 6.4.2, which depends on `esbuild ^0.25.0` and `rollup ^4.34.9`. Both
overrides already sit at or above what Vite 6 requires, so they did not move. They
stay exact-pinned and remain inside the cooldown.

### Why Vitest 3 and not Vitest 4

Vitest 3.2.4 satisfies everything the project needs today: the unit suite, coverage
generation, and the runner that downstream tooling drives. It carries the smallest
migration off the 1.x line and unblocks the Storybook harness by making
`@vitest/browser` available. Vitest 4 is only required at the moment the Storybook
addon is installed, because that is the only consumer that pulls
`@vitest/browser-playwright`. Pairing the 4.x jump with the change that installs the
addon keeps each upgrade tied to a concrete need and avoids carrying a second major
bump ahead of any code that exercises it.

### The config migration was nearly empty, with one mechanical test-file fix

The Vitest configuration lives as a single inline `test` block in `vite.config.ts`:
`globals: true`, `environment: 'jsdom'`, a setup file, an exclude list, and a v8
coverage block. None of those shapes changed across 1 to 3. There is no workspace
or projects config, no `environmentMatchGlobs`, and no `deps.inline`, so none of the
1-to-3 config-shape migrations applied. The config file was left untouched.

The only source change the bump forced was a type-signature update. Vitest 3
narrowed the `Mock` and `vi.fn` generics from the old two-argument form
`Mock<TArgs, TReturn>` to a single function-type argument
`Mock<(...args) => TReturn>`. One test file, `app/app.test.tsx`, used the old form
in eight places (a four-method fake snapshot store, declared once and constructed
once). Each site was rewritten to the function-type form. This is a mechanical
rename driven by an upstream API change with no behavior difference, so it rides in
the same dependency-bump commit rather than going through a separate test cycle.

### The surgical-install cooldown exception

The repository enforces a 30-day dependency cooldown through `.npmrc`
(`minimum-release-age=43200`), which refuses to install any package whose newest
matching release is younger than 30 days. A plain install of these four pins would
trip that guard, not on the four pins themselves but on unrelated transitive
packages already in the tree that happen to have a too-young release available. To
land exactly the intended bump without disturbing those pre-existing pins, the
install was run with `--config.minimumReleaseAge=0`:

```
pnpm add -D vitest@3.2.4 @vitest/coverage-v8@3.2.4 @vitest/browser@3.2.4 \
  vite@6.4.2 --config.prefer-frozen-lockfile=true --config.minimumReleaseAge=0
```

This exception is safe only because every one of the four targets is a known
release verified to be older than the cutoff. The flag suppresses the cooldown for
this one install; it does not change the policy. `.npmrc` is unchanged, every new
pin is exact with no range prefix, and the lockfile diff was checked to confirm only
the four intended keys and their pinned transitives moved. This follows the same
surgical-install pattern used for earlier override-scoped bumps.

## Consequences

- The full unit suite passes on Vitest 3, coverage still generates through the v8
  provider, `tsc -b && vite build` succeeds on Vite 6, and `storybook build`
  completes on the Vite 6 toolchain. Typecheck, lint, and the formatter all stay
  clean.
- `@vitest/browser` 3.2.4 is now present, so the Storybook component-test harness
  can begin. That harness is expected to carry the follow-on Vitest 3.2.4 to 4.x
  move, adding `@vitest/browser-playwright` at the same time, because 4.x is only
  needed once the addon is installed.
- The deferred Vite 5 to 6 advisory upgrade is resolved as part of this change. The
  Dependabot alerts that tracked it close as fixed once this lands.
- The `tmp` dependency advisory stays open. Its only patched release is younger than
  the cooldown cutoff, so it is split to a small follow-up that pins it through
  `pnpm.overrides` once it ages past 30 days.
- Mutation testing is not exercised by this change. The local `mutate:check`
  dry-run fails before any mutant runs, on a Stryker typescript-checker plugin
  injection error, and that same failure reproduces on the pre-bump base, so it is
  a pre-existing local-environment issue rather than a regression from Vitest 3.
  The Stryker Vitest runner itself resolved against Vitest 3.2.4 and instrumented
  the source successfully, which confirms the runner is compatible with the new
  version. Restoring the mutation dry-run locally is left as separate tooling work.

## References

- ADR-0013 (the cooldown-exclusions policy and the `.npmrc` cooldown this change
  honors through the surgical-install exception).
- ADR-0016 (the Lighthouse and Stryker fixtures; the Stryker runner version that
  this bump confirms compatible with Vitest 3).
- Issue tracker: the test-stack upgrade and the folded-in deferred dev-dependency
  bump for Vite.
