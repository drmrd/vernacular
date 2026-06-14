---
slug: decisions/ADR-0076-wordmark-typeface
title: 'ADR-0076: The application wordmark uses Inter, not the heading serif'
type: decision
tags: [design-system, typography, shell, wordmark, draughtsmans-restraint]
related: [decisions/ADR-0069-draughtsmans-restraint-visual-language]
sourceFiles:
  [
    docs/specs/2026-06-13-visual-design-language.md,
    docs/specs/2026-06-14-editor-shell-realignment.md,
    docs/specs/2026-06-14-editor-fidelity-pass.md,
    editor/shell/editor-shell.css,
  ]
status: current
updated: 2026-06-14
---

# ADR-0076: The application wordmark uses Inter, not the heading serif

## Status

Accepted. Reconciles a conflict between two approved specs found during the editor
fidelity pass.

## Context

The Draughtsman's Restraint visual language (ADR-0069 and
`docs/specs/2026-06-13-visual-design-language.md`) scopes the EB Garamond heading face to
three content roles: project names, component titles, and period subtitles. Each names a
specific artifact or period, so the serif carries the heritage identity where the content
is about an old house.

The later editor shell realignment spec
(`docs/specs/2026-06-14-editor-shell-realignment.md`, section 3) listed the top-bar
wordmark as EB Garamond. The running build renders the wordmark in Inter
(`editor-shell.css`, `.editor-shell__wordmark`). The fidelity-pass audit surfaced the
mismatch and had to pick one source of truth.

## Decision

The application wordmark "Vernacular" stays in Inter, the UI face. The wordmark labels the
application, not a project, a component, or a period, so it sits outside the three serif
roles the visual language defines. The serif identity still reads in the rail, where the
project name renders in EB Garamond.

The realignment spec section 3 line naming EB Garamond for the wordmark is corrected to
Inter. The visual language spec and ADR-0069 stand unchanged; this decision applies their
existing rule rather than altering it.

## Consequences

- One typographic rule governs the serif: it marks project, component, and period
  content, never application chrome. The wordmark is application chrome.
- `editor-shell.css` needs no change; the implementation already matched this decision.
- A future home screen or marketing surface that wants a serif wordmark revisits this
  decision rather than diverging in silence.
