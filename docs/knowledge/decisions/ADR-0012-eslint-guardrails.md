---
slug: decisions/ADR-0012-eslint-guardrails
title: 'ADR-0012: ESLint guardrails and layer boundary enforcement'
type: decision
tags: [linting, eslint, clean-code, boundaries, code-quality]
related:
  [
    decisions/ADR-0001-six-layer-architecture,
    decisions/ADR-0009-test-pyramid-rgb-tdd,
    decisions/ADR-0017-layer-boundary-enforcement-repair,
  ]
sourceFiles: [eslint.config.js, .claude/rules.md, .jscpd.json]
status: current
updated: 2026-06-02
---

# ADR-0012: ESLint guardrails and layer boundary enforcement

## Status

Accepted. The boundary-enforcement portion was repaired and given a fitness
test; see ADR-0017.

## Context

The initial ESLint configuration covered only TypeScript correctness, React
Hooks, and React Refresh. The Clean Code rubric in `.claude/rules.md` calls for
size and complexity limits, naming consistency, unused-symbol detection, and
most importantly the six-layer dependency direction. Without mechanical
enforcement, these intents drift; a contributor (human or agent) writes a
200-line function or imports Three.js from a `core/` file and the violation is
only caught at code review.

## Decision

Three plugin additions and one rule expansion:

- `eslint-plugin-boundaries` enforces the six-layer dependency direction. The
  `boundaries/elements` settings map each layer name to its directory; the
  boundary rule whitelists allowed cross-layer imports. `core/` may import
  nothing else; `app/` may import everything below it.
- `eslint-plugin-unused-imports` cleans up unused imports (error) and unused
  locals (warn with `_` prefix exemption).
- `jscpd` is configured for repository-wide duplicate detection via `pnpm dup`.
  Reports go to `reports/jscpd/`.
- The full Clean Code rule set lands: `max-lines-per-function`, `max-lines`,
  `max-params`, `complexity`, `max-depth`, `no-nested-ternary`,
  `no-magic-numbers`, `no-console`, plus `@typescript-eslint/naming-convention`
  for type-and-identifier shape.

Test files and config files get per-file overrides (notably `no-magic-numbers`
off for tests where literal expectations are natural). Registry files
(`**/registries/**`) later got the same `no-magic-numbers` exemption because
they are declarative data tables (ADR-0006).

## Consequences

- The mechanical guard catches most layer violations before code review.
- A function approaching the size limit forces a decomposition decision, which
  is the right pressure for the project's architecture.
- Test files keep the literal numeric expectations the FIRST discipline calls
  for (`expect(x).toBe(42)`), without rule noise.
- The custom rules `no-direct-three-imports-outside-engine` and
  `no-direct-storage-API-outside-storage` listed in the design specification are
  not implemented yet. The boundaries plugin covers the layer-direction half of
  their intent; the import-path-specific half is deferred.

## Correction

This ADR originally predicted that the boundaries rule "matches nothing today
and starts enforcing as soon as `core/` and friends appear." That was wrong.
When the first real `core/` and `storage/` modules landed, the rule was found to
be a no-op for three independent reasons (element globs too shallow, no import
resolver, a deprecated v5 rule form). ADR-0017 documents the repair and adds a
committed architecture-fitness test so the guard can never silently regress
again.

## References

- Design specification, section 9.8 (Automated guardrails).
- `.claude/rules.md` (the rubric the rules realize).
- ADR-0001 (the six-layer architecture).
- ADR-0017 (the boundary-enforcement repair and fitness-test guard).
