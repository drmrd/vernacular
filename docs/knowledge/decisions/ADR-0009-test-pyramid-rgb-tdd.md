---
slug: decisions/ADR-0009-test-pyramid-rgb-tdd
title: 'ADR-0009: Test pyramid with red-green-blue TDD and independent agents'
type: decision
tags: [testing, tdd, quality, clean-code, agents]
related: [decisions/ADR-0001-six-layer-architecture]
sourceFiles: [docs/specs/2026-06-01-vernacular-design.md]
status: current
updated: 2026-06-02
---

# ADR-0009: Test pyramid with red-green-blue TDD and independent agents

## Status

Accepted. Implementation begins in Phase 0c.2 (subagent definitions) and Phase 0e (testing scaffolds); enforced from Phase 0f onward.

## Context

A floor planner mixes pure math (wall topology, color science), heavy UI (an editor canvas plus 3D viewport), and a 3D rendering layer that is notoriously hard to test mechanically. Without a deliberate testing discipline, the project can drift into a mode where new features ship with thin unit tests and visual regressions go undetected. The user has been explicit about wanting "militant" TDD.

## Decision

A pyramid with the standard shape (many unit tests, fewer integration, even fewer end-to-end), and the following layer assignments:

- **Unit**: Vitest. Pure functions in `core/` (geometry, units, color science, command handlers, registry resolvers).
- **Property-based**: fast-check, integrated with Vitest. For geometry under random configurations, unit round-trips, color round-trips, and command coalescing.
- **Integration**: Vitest. Multi-module flows in `core/` with no DOM.
- **Component**: React Testing Library plus Storybook play functions.
- **3D scene snapshot**: Custom Three.js harness with perceptual diff and per-renderer baselines.
- **End-to-end**: Playwright across Chromium (WebGPU), Firefox, and WebKit. Visual regression via `toHaveScreenshot`.
- **Accessibility**: `@axe-core/playwright` on every page transition.
- **Performance**: Three.js render benchmark harness, Lighthouse CI, bundle-size budget, memory leak detection.
- **Acceptance**: User journey scenarios traced to each phase's AC table.

Application code is built via the **red-green-blue** TDD cycle: write a failing test (red), make it pass with the minimal implementation (green), apply Clean Code review and any resulting refactors (blue). Each phase of the cycle is a separate commit. The "blue" commit is mandatory; if no changes are needed, the commit is an empty `refactor:` marker.

The three roles (test author, implementer, refactorer) are intentionally separated; subagent definitions in `.claude/agents/` enforce this by giving each agent only the file access it needs. The implementer cannot see the test source (only the failing test's runner output) and the test author cannot see implementation source.

## Consequences

- Domain logic is testable in Node, with feedback under one second.
- Adding new component tests for a feature is mechanical because Storybook stories double as visual regression baselines.
- The discipline is enforceable by CI checks (PR commit-history pattern) plus the `pr-reviewer` agent.

## References

- Design specification, section 9 (Testing strategy).
- ADR-0001 (six-layer architecture; the layering is what makes `core/` testable without a browser).
