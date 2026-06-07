---
slug: decisions/ADR-0017-layer-boundary-enforcement-repair
title: 'ADR-0017: Layer-boundary enforcement via eslint-plugin-boundaries v6'
type: decision
tags: [linting, eslint, boundaries, architecture, fitness-test]
related: [decisions/ADR-0012-eslint-guardrails, decisions/ADR-0001-six-layer-architecture]
sourceFiles: [eslint.config.js, tests/architecture/layer-boundaries.test.ts, package.json]
status: current
updated: 2026-06-02
---

# ADR-0017: Layer-boundary enforcement via eslint-plugin-boundaries v6

## Status

Accepted. The repair and the architecture-fitness guard are landed.

## Context

ADR-0012 added `eslint-plugin-boundaries` to encode the six-layer downward
dependency direction (ADR-0001). It predicted the rule "matches nothing today
and starts enforcing as soon as `core/` and friends appear." When `core/` and
`storage/` arrived with real modules, that prediction proved wrong: the
configuration was a no-op and had always been one. It had never been exercised
against real layer files, so three defects had gone unnoticed. An illegal
`core -> storage` import would have passed lint cleanly.

## Decision

Fix the three defects and add a committed fitness test so the guard can never
silently regress again.

### Defect 1: element globs matched one level too deep

`boundaries/elements` mapped each layer with a single-segment glob, for example
`core/*`. That matches a file at `core/foo.ts` but not `core/model/types.ts`.
Real layer code lives in nested directories, so the plugin classified those
files as belonging to no layer and skipped them. Fixed by switching every layer
pattern to `core/**`, `storage/**`, and so on, which matches at any depth.

### Defect 2: no import resolver was configured

The plugin resolves an import specifier to a file to decide which layer it
targets. Without an `import/resolver` setting it could not resolve TypeScript
imports, so cross-layer imports were never evaluated. Fixed by adding
`'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } }` to
the flat-config `settings`.

### Defect 3: deprecated v5 rule form

The config used `eslint-plugin-boundaries` v5's `boundaries/element-types` rule
with array selectors (`{ from: ['core'], allow: [] }`). The installed plugin is
v6 (`^6.0.2`), where that rule is replaced by `boundaries/dependencies` with
object selectors. Fixed by migrating to the v6 form:

- `boundaries/element-types` becomes `boundaries/dependencies`.
- `core` is expressed as
  `{ from: { type: 'core' }, disallow: { to: { type: '*' } } }` because it sits
  at the bottom and may import nothing above it.
- Each higher layer uses
  `{ from: { type: 'storage' }, allow: { to: { type: 'core' } } }` and so on up
  the stack, with the allow list widening as the layer rises.

### The fitness-test guard

`tests/architecture/layer-boundaries.test.ts` runs ESLint programmatically
(`new ESLint().lintText(code, { filePath })`) against two synthetic samples:

- a `core/` file importing from `../storage`, which must produce a
  `boundaries/dependencies` message (illegal, rejected);
- a `storage/` file importing from `../core`, which must not (legal, allowed).

The test carries `// @vitest-environment node` because ESLint's `lintText`
reads configuration and source through Node's `fs`, which needs the node
environment rather than the project-wide jsdom. This test is committed
(it lives under `tests/`, not in the gitignored knowledge tree) and is the
durable guard: any future change that re-breaks the globs, drops the resolver,
or regresses the rule form turns the test red.

## Consequences

- The layer-direction invariant from ADR-0001 is now genuinely enforced, not
  merely configured. The first real layer code on the branch validated it end
  to end.
- ADR-0012's note that the boundaries rule was a harmless no-op until layers
  appeared is superseded by this ADR: it was a no-op for the wrong reason
  (three defects), not a benign "nothing to match yet."
- The fitness test couples the build to the precise rule id
  `boundaries/dependencies`. A future intentional plugin upgrade that renames
  the rule must update both `eslint.config.js` and the test together.
- Running ESLint inside a Vitest case adds a small amount of wall-clock time to
  the suite, paid once. The coverage is worth it: a silent guard is worse than
  no guard.

## Alternatives considered

- **Trust lint config without a test.** Rejected: the config had silently been
  a no-op since ADR-0012. A configuration-only guard with no test is exactly the
  failure mode this ADR repairs.
- **Assert the invariant with a custom dependency-graph script instead of
  ESLint.** Rejected: the plugin already encodes the layer map; a parallel
  script would duplicate that map and drift from it. Driving the real ESLint
  config keeps a single source of truth.

## References

- ADR-0001 (the six-layer architecture this enforces).
- ADR-0012 (the original guardrails ADR whose no-op prediction this corrects).
- `eslint-plugin-boundaries` v6 `boundaries/dependencies` rule.
