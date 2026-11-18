---
slug: decisions/ADR-0185-lint-warnings-fail-and-exceptions-are-recorded
title: 'ADR-0185: Lint warnings fail CI, and exceptions are one recorded list'
type: decision
tags: [linting, eslint, clean-code, boundaries, purity, import-cycles, ci]
related:
  [
    decisions/ADR-0012-eslint-guardrails,
    decisions/ADR-0017-layer-boundary-enforcement-repair,
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0180-one-settings-port,
  ]
sourceFiles:
  [
    eslint.config.js,
    .claude/rules.md,
    scripts/ci/select-tests.mjs,
    tests/architecture/layer-boundaries.test.ts,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-11-18
---

# ADR-0185: Lint warnings fail CI, and exceptions are one recorded list

## Status

Current. The owner chose on 2026-11-14 that warnings fail CI and that each existing warning is
either fixed or recorded against the issue that removes it. The owner approved the rest the same
day, with section 5.5 of `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`. It amends
ADR-0012. The lint configuration changed with #683, and every rule is now at error level.

> Amended on 2026-11-18 by ADR-0175, which adds the `session/` layer. An entry of the exception list
> may name one layer that its file may import beyond the list of its own layer
> (`{ file, allowImportOf, issue }`) in place of a rule. The other entries still name a rule. The
> session testing entry (`session/testing`) gets the same check as the engine testing entry, so a
> relative import such as `../testing` is now checked inside `session/` as well as inside
> `engine/`.

## Context

ADR-0012 set the size and complexity rules to `warn`. Section 9.8 of the design specification
describes a second, higher limit per rule that is an error, but that limit was never configured.
`pnpm lint` has no warning limit, so no size rule can fail CI. 43 warnings pass today.

ADR-0012 also deferred two rules: no direct Three.js import outside `engine/`, and no storage API
outside `storage/`. The boundaries rule covers imports between the repository's layers only. Nothing
in lint stops `core/` from importing React or from using a DOM global. No such violation exists
today, but the architecture refactor round moves a great deal of code between layers.

The architecture tests live under `tests/`. On a pull request the test selection runs that directory
only when a file in it changed, so a pull request that changes only source does not run them.

## Decision

- Every rule that was a warning is an error at its configured limit. `pnpm lint` runs with
  `--max-warnings 0`. The higher limits of section 9.8 are dropped.
- Exceptions are one list in `eslint.config.js`. An entry names a file, a rule, and the issue that
  removes it. For a size rule it caps the file at its measured value. A test fails an entry whose
  file meets the standard limit again.
- Each existing warning in code that no planned work rewrites is fixed. The others are entries.
- Lint enforces purity with restricted imports and restricted globals. `core/` imports no React or
  Three.js package and uses no browser-only global. `storage/` imports neither package. `engine/`
  imports no React package. Only `engine/` imports `three`, and only `bridge/` imports
  `@react-three/*`.
- The browser-global rule covers the production files of `core/` only. Test files there
  (`core/**/*.test.ts` and `core/**/*.test.tsx`) are outside it, because the unit tests run under
  jsdom and two SVG exporter tests use `DOMParser` to check the exported markup. The rule protects
  shipped `core/` code, which must run with no browser. The React and Three.js import rules still
  apply to those test files. The owner decided this on 2026-11-15.
- An import cycle through value imports fails. A cycle of type-only imports is allowed.
- The tests under `tests/` run on every pull request that changes a source layer.

The ban on browser storage globals outside `storage/` arrives with the settings port (ADR-0180). An
import order inside each layer is left to the later stage specifications.

## Consequences

- A new warning cannot land. A file on the list cannot grow past its recorded value.
- The list shrinks as the stages land, and each removal is visible in a diff.
- Section 9.8 of the design specification and the sentence on complexity in `.claude/rules.md`
  describe one limit per rule and the exception list.
- The format suites under `tests/format/` now run before a merge, not after it.
- Inline disable comments stay where they carry a reason. A new one needs a reason.
- Section 9.8 of the design specification no longer lists `jsdoc/require-jsdoc` or
  `import/no-internal-modules`, because neither was ever configured and no plugin for them is
  installed. It describes `jscpd` as the report that `pnpm dup` prints, not as a lint rule. The
  engine testing entry (`engine/testing`) re-exports the few Three.js names that two `bridge/react`
  tests need, and lint fails a production file of `bridge/`, `editor/`, `app/`, or `src/`, or of
  `engine/` outside `engine/testing/`, that imports it. Inside `engine/`, a file named
  `*-test-support.ts` or `*-test-support.tsx` counts as test support for this rule, so it may
  import the entry. A relative import such as `../testing` is checked inside `engine/` only. In
  the other layers a sibling folder named `testing` is not the entry, so the rule leaves it alone.

## References

- `docs/specs/2026-11-14-data-loss-fixes-and-guard-rails.md`, section 5.5.
- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.9.
- Issue #683.
