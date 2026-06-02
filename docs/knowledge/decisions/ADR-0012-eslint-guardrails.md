---
slug: decisions/ADR-0012-eslint-guardrails
title: 'ADR-0012: ESLint guardrails and layer boundary enforcement'
type: decision
tags: [linting, eslint, clean-code, boundaries, code-quality]
related: [decisions/ADR-0001-six-layer-architecture, decisions/ADR-0009-test-pyramid-rgb-tdd]
sourceFiles: [eslint.config.js, .claude/rules.md, .jscpd.json]
status: current
updated: 2026-06-02
---

# ADR-0012: ESLint guardrails and layer boundary enforcement

## Status

Accepted. Implemented in Phase 0d.1.

## Context

The Phase 0a ESLint configuration covered only TypeScript correctness, React Hooks, and React Refresh. The Clean Code rubric in `.claude/rules.md` calls for size and complexity limits, naming consistency, unused-symbol detection, and most importantly the six-layer dependency direction. Without mechanical enforcement, these intents drift; a contributor (human or agent) writes a 200-line function or imports Three.js from a `core/` file and the violation is only caught at code review.

## Decision

Three plugin additions and one rule expansion:

- `eslint-plugin-boundaries` enforces the six-layer dependency direction. The `boundaries/elements` settings map each layer name to its directory; the `boundaries/element-types` rule whitelists allowed cross-layer imports. `core/` may import nothing else; `app/` may import everything below it.
- `eslint-plugin-unused-imports` cleans up unused imports (error) and unused locals (warn with `_` prefix exemption).
- `jscpd` is configured for repository-wide duplicate detection via `pnpm dup`. Reports go to `reports/jscpd/`.
- The full Clean Code rule set lands: `max-lines-per-function`, `max-lines`, `max-params`, `complexity`, `max-depth`, `no-nested-ternary`, `no-magic-numbers`, `no-console`, plus `@typescript-eslint/naming-convention` for type-and-identifier shape.

Test files and config files get per-file overrides (notably `no-magic-numbers` off for tests where literal expectations are natural).

## Consequences

- The mechanical guard catches most layer violations before code review. The boundaries plugin is configured today against directories that do not yet exist (Phase 0f introduces them); it simply matches nothing today and starts enforcing as soon as `core/` and friends appear.
- A function approaching the size limit forces a decomposition decision, which is the right pressure for the project's architecture.
- Test files keep the literal numeric expectations the FIRST discipline calls for (`expect(x).toBe(42)`), without rule noise.
- The custom rules `no-direct-three-imports-outside-engine` and `no-direct-storage-API-outside-storage` listed in the design specification are not implemented yet. The boundaries plugin covers the layer-direction half of their intent; the import-path-specific half is deferred to a follow-up (0d.x) when Phase 0f introduces the imports in question.

## References

- Design specification, section 9.8 (Automated guardrails).
- `.claude/rules.md` (the rubric the rules realize).
- ADR-0001 (the six-layer architecture).
