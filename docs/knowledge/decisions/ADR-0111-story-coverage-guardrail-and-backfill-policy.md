---
slug: decisions/ADR-0111-story-coverage-guardrail-and-backfill-policy
title: 'ADR-0111: Story coverage guardrail and the component story backfill policy'
type: decision
tags: [tooling, testing, storybook, stories, autodocs, coverage, guardrail, ratchet]
related:
  [
    decisions/ADR-0105-storybook-browser-mode-component-tests,
    decisions/ADR-0110-msw-network-mocking-for-component-tests,
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0013-cooldown-exclusions,
  ]
sourceFiles:
  [
    scripts/story-coverage/coverage.ts,
    scripts/story-coverage/coverage.test.ts,
    scripts/story-coverage/uncovered-components.ts,
    scripts/story-coverage/story-coverage.test.ts,
    editor/design-system/icon-button.stories.tsx,
    editor/design-system/segmented.stories.tsx,
    editor/shell/unit-toggle.stories.tsx,
    eslint.config.js,
  ]
status: current
updated: 2026-06-19
---

# ADR-0111: Story coverage guardrail and the component story backfill policy

## Status

Accepted, landed. Every React component module under `app`, `editor`, and `bridge` is now
either covered by a co-located story or recorded on a tolerated allowlist, and a test fails
the build when that stops being true. The change also backfills stories for eight
design-system and shell components and turns on autodocs for the documented set. It extends
ADR-0105, which made stories run as browser-mode tests, and ADR-0110, which let those tests
mock the network.

## Context

ADR-0105 built the harness that runs stories as component tests, and ADR-0110 added the
network mocking that data-driven components need. What neither did was write the stories. At
the start of this work only four story files existed against roughly eighty-six exported
components, so most of the interface had no documentation page and no render-level test.

The issue asked for two things: stories for every component, and a guardrail that fails when
a component has none. Writing every story in one change is the wrong shape. It would be a
large pull request that is hard to review, and it does not slice into the test-first cycle
the project follows. The lasting part of the request is the guardrail. Once it exists the
remaining stories can land in small batches without coverage quietly sliding backward.

## Decision

Ship the guardrail now, with a representative slice of stories that proves it works, and
defer the rest to per-area follow-on issues that the guardrail itself tracks.

### A test, not a lint rule or a standalone script

The guardrail is a Vitest test in the existing unit project. It walks `app`, `editor`, and
`bridge` for `.tsx` files with `node:fs` and reports any component module that has neither a
co-located story nor an allowlist entry. It mirrors the `css-literal-guard` test that already
walks the editor stylesheets, so it follows an established idiom rather than a new kind of
check, and it runs inside `pnpm test`, so the gate already covers it.

A custom eslint rule was the other option and was rejected. The check is cross-file: it
correlates a component file with the existence of a sibling story and an entry in a separate
data file. A flat-config lint rule has no clean way to express "every file in one set has a
counterpart in another" without an AST plugin, which would be a new dependency under the
thirty-day cooldown. A standalone script under `scripts` was rejected too, since it would sit
outside `pnpm test` and need its own wiring into the gate.

### Module-level coverage, matched by file name

A component module is any `.tsx` file under the three roots that exports a PascalCase function
or component const, after the test, spec, and story files are filtered out. A module counts as
covered when a `<name>.stories.tsx` sits next to `<name>.tsx`. The check classifies exports by
reading the source text with a few regular expressions rather than parsing it, again to avoid
an AST dependency. Hooks, lowercase helpers, type-only exports, and bare PascalCase consts such
as a `createContext` result are not treated as components.

Coverage is tracked per module, not per exported symbol. A file that exports two components,
such as the empty and loading states that share `status.tsx`, is satisfied by one story file
with a story for each. This reading matches the co-located convention and keeps the check
deterministic. Per-symbol coverage is a stronger ratchet that a later change can add.

### The ratchet allowlist

`scripts/story-coverage/uncovered-components.ts` holds the component modules that may lack a
story for now, each with a plain-English reason. The check compares the live set of uncovered
modules against that list and fails in three ways. A module that is uncovered and not on the
list fails the build, which stops a new component from arriving without a story. A list entry
that now has a story fails too, which forces the list to shrink as coverage lands instead of
going stale. A list entry whose file no longer exists fails as well, which keeps the list
honest as components are renamed or removed.

The list was seeded by running the finder over the real tree, so the suite is green today with
every currently-uncovered module recorded. Each story added in this change removed its own
entry in the same commit, which kept the check green at every step and took the list from
eighty-two entries to seventy-four.

### The slice and autodocs

This change backfills eight stories. Seven are the design-system primitives that lacked one:
the icon button, segmented control, field, stack, section label, panel slot, and the shared
empty and loading status states. The eighth is the unit toggle from the shell, a widely reused
component included to add an interaction test. Every new story carries the `autodocs` tag, and
the tag was added to the three pre-existing stories as well, so Storybook generates
documentation pages across the documented set. `build-storybook` generating without error is
the proof that autodocs works.

### The deferred work and its floor

The remaining stories are deferred to per-area follow-on issues, one each for the rest of the
design system, the shell, the tools and panels, the library, and the bridge and scene layer.
The allowlist is the living record of what is left. The goal of a story for every component is
reached when the list reaches its floor rather than zero, because some components cannot get an
isolated browser-mode story. The scene components in `bridge` and the editor shell need a live
R3F canvas, a WebGPU context, or the full editor provider tree to render, so they stay on the
list with a reason that says so. The bridge and scene follow-on issue decides whether to give
them an integration-style story or leave them permanently recorded.

## Consequences

- Story coverage cannot regress silently. A new component without a story fails the gate, and
  the allowlist makes the remaining gap visible and countable rather than implicit.
- The remaining backfill becomes small reviewable batches instead of one large change, and each
  batch shrinks the allowlist by removing the entries it covers.
- The check carries no new dependency. It uses `node:fs` like the stylesheet guard before it,
  so the cooldown and exact-pin rules do not come into play.
- The classification is a text heuristic, so it can misjudge an unusual export. The allowlist
  with a reason is the escape hatch for a genuine false positive, and the module-level
  granularity keeps the reach of a misjudgment small.
- The data file is exempt from the file-length limit through a narrow eslint override scoped to
  that one path, since its length is inherent to its purpose and falls as coverage grows.

## References

- ADR-0105 (the browser-mode component-test harness these stories run under).
- ADR-0110 (the network mocking that the deferred library stories will reuse).
- ADR-0096 (the design-system consolidation that produced the primitives this slice covers).
- ADR-0013 (the thirty-day cooldown policy, which the no-new-dependency choice stays clear of).
