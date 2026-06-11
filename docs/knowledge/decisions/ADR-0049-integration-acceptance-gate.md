---
slug: decisions/ADR-0049-integration-acceptance-gate
title: 'ADR-0049: A journey-test layer and a required integration-acceptance gate'
type: decision
tags:
  [
    testing,
    journeys,
    end-to-end,
    integration,
    coverage-matrix,
    continuous-integration,
    audit,
    editor,
    wiring,
  ]
related:
  [
    decisions/ADR-0044-mvp-delivery-tracks-and-parallel-resequencing,
    decisions/ADR-0048-paint-color-palette-and-site-metadata,
  ]
sourceFiles:
  [
    docs/specs/2026-06-10-editor-experience-makeover.md,
    docs/plans/2026-06-10-journey-test-harness-and-integration-acceptance-gate.md,
    e2e/tests/journeys/support.ts,
    e2e/tests/journeys/draw-wall.spec.ts,
    e2e/journey-coverage.json,
    e2e/JOURNEYS.md,
    scripts/integration-audit/integration-audit.mjs,
    scripts/integration-audit/integration-audit.test.mjs,
    .github/workflows/ci.yml,
  ]
status: current
updated: 2026-06-10
---

# ADR-0049: A journey-test layer and a required integration-acceptance gate

## Status

Accepted. The first slice of the editor experience makeover
(`feat/editor-experience-makeover`, spec
`docs/specs/2026-06-10-editor-experience-makeover.md`) introduces a journey-test
harness over the assembled application, a machine-readable coverage matrix, and a
required audit that fails when a capability marked `required` has no journey test
proving it. This record captures the testing decision; the makeover slices that
follow each rely on it.

## Context

The parallel delivery tracks of the MVP (ADR-0044) each shipped unit-green in
isolation. Their components passed their own unit and component tests, but the
composition layer that wires them into the running editor was never finished and
no test exercised the assembled application end to end. The result was a class of
defect that every existing test suite was blind to: a finished surface mounted
nowhere, or an interaction that no part of the shell dispatches. The paint
pickers and the site editor, for example, are built and exported yet the shell
renders empty paint slots (ADR-0048 records the three-dimensional seam, a related
but distinct convergence point). Undo, redo, delete, and cancel have command
handlers but no keybinding or control reaches them.

Unit and component tests cannot catch this. A component test mounts the component
it is testing, so it proves the component works in isolation, which is exactly
the state that already held while the editor was unusable. The missing assurance
is that a capability is reachable from the real, fully composed application.

The existing `rgb:audit` (the red-green-blue commit-history gate) governs how a
change is built. It does not, and is not meant to, observe whether the resulting
feature is wired into the product. That reachability question needed its own
gate.

## Decision

Add three pieces that together make reachability a first-class, enforced property.

1. A journey-test layer under `e2e/tests/journeys/`. Each journey drives the real
   assembled application through a user-facing flow with the existing end-to-end
   harness (Playwright, the preview server, the chromium project). A shared
   `support.ts` centralizes every application selector and the common flows, so
   that when a later slice restyles the shell only that one module changes rather
   than every journey. The first journey characterizes the existing draw-a-wall
   flow and proves the harness.

2. A coverage matrix, `e2e/journey-coverage.json`, that is the single source of
   truth. Every user-facing capability is a row of `{ id, title, status }`, where
   `title` is the exact journey test title that proves it and `status` is
   `required` or `pending`. A human-readable view lives in `e2e/JOURNEYS.md`.

3. A required integration-acceptance gate,
   `scripts/integration-audit/integration-audit.mjs`. Its core is pure and
   dependency-injected (it takes the parsed matrix and the journey titles), so it
   is unit-tested exactly as `runRgbAudit` is. A thin command-line wrapper wires
   the real filesystem: it reads the matrix and collects the test titles declared
   under the journeys directory. The audit fails when any `required` capability
   has no journey test with its title. It runs in the `check` continuous-
   integration job beside typecheck, lint, and test, and is exposed as
   `pnpm integration:audit`. The journey specs themselves run in the existing
   end-to-end job because they live under `e2e/tests/`.

The matrix is seeded with the full makeover capability list. Only `draw-wall` is
`required` and covered today; every other capability is `pending`. A `pending`
capability is tracked but not enforced, so seeding the list does not turn the
build red on day one. The protocol that makes the gate work is the flip: the
slice that builds a capability changes its row from `pending` to `required` in
the same change that adds its passing journey test. A slice therefore cannot mark
its capability done without a journey test that proves the capability is reachable
from the assembled editor.

This audit is a sibling of `rgb:audit`, not a replacement. Both are fast static
checks over the repository that run in continuous integration. The `rgb:audit`
governs commit cadence (the red-green-blue discipline); this audit governs
reachability (a feature is wired into the product). The two are orthogonal, and a
change must satisfy both.

## Consequences

A feature is no longer considered done at unit-green. The durable fix for the
built-but-unwired failure mode is that the definition of done for each makeover
slice now includes a journey test over the real application, enforced by a gate
that cannot be satisfied by isolated component tests.

The cost is a journey test and a one-line matrix flip per capability, which is
small and is owed precisely where it was previously missing. The journey suite is
slower than unit tests because it boots the application, so it stays a focused set
of capability-proving flows rather than an exhaustive interaction catalog; the
unit and component suites continue to cover breadth.

Because every application selector is centralized in `support.ts`, the later
restyling slices change selectors in one place. Because the audit is a static
check keyed to test titles, it cannot itself prove a flow passes; that assurance
comes from the journey suite running in the end-to-end job. The two are
complementary: the audit guarantees a test exists and is marked done honestly,
and the suite guarantees it passes.

## References

- Editor experience makeover specification:
  `docs/specs/2026-06-10-editor-experience-makeover.md`, the testing-strategy
  section.
- Slice plan:
  `docs/plans/2026-06-10-journey-test-harness-and-integration-acceptance-gate.md`.
- ADR-0044 (the MVP delivery tracks whose isolation produced the failure mode).
- ADR-0048 (the paint and site work whose surfaces are among the unmounted
  capabilities the matrix tracks).
- The sibling commit-history gate: `scripts/rgb-audit/`.
