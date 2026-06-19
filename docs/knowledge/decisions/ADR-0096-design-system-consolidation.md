---
slug: decisions/ADR-0096-design-system-consolidation
title: 'ADR-0096: Design-system consolidation'
type: decision
tags: [design-system, tokens, primitives, chrome, consistency, accessibility, css, lint]
related:
  [
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0076-wordmark-typeface,
    decisions/ADR-0081-canvas-resolves-design-tokens-at-runtime,
  ]
sourceFiles:
  [
    editor/design-system/tokens.css,
    editor/design-system/section-label.tsx,
    editor/design-system/section-label.css,
    editor/design-system/icon-button.tsx,
    editor/design-system/icon-button.css,
    editor/design-system/segmented.tsx,
    editor/design-system/segmented.css,
    editor/design-system/button.tsx,
    editor/design-system/css-literal-guard.test.ts,
  ]
status: current
updated: 2026-06-18
---

# ADR-0096: Design-system consolidation

## Status

Accepted, landed. This is an extension of ADR-0069 (Draughtsman's Restraint), not a
redesign. The visual language is unchanged; the chrome that expresses it now speaks one
vocabulary. The token scales gained the missing steps, three interactive primitives
absorb the hand-rolled idioms scattered across the editor, the drifted active treatments
collapse to one, and a dependency-free test guards the editor CSS against raw size
literals.

## Context

ADR-0069 set the visual language and the two-tier token contract, but the call sites grew
their own dialects on top of it. Roughly ten hand-rolled button idioms, several raw
unstyled buttons, four copy-pasted section labels, and five separate "active" treatments
for segmented controls, tabs, and chips had drifted apart. The same intent (a selected
option, a section heading, an icon button) was spelled a different way in each panel, so a
change to any one treatment meant hunting down every copy. The token scales also had gaps:
spacing and type stopped short of the sizes the chrome actually used, so components reached
for raw literals where a scale step was missing.

None of this is meant to change how the editor looks. The work is to make the chrome agree
with itself, so the downstream polish issues (target sizes, contrast, disabled affordance,
action dominance, unstyled surfaces) each have one place to change rather than many.

## Decision

**Fill in the scales.** The spacing scale gains `--space-6` (2rem) and `--space-7` (3rem),
and the type scale gains `--font-size-xs` (0.7rem) and `--font-size-xl` (1.5rem). A radius
token `--radius-pill` (9999px) names the fully round pills. `--font-size-xs` at 0.7rem sits
slightly off the prior ad-hoc 0.68rem labels; that small shift is deliberate, the scale
wins over the literal.

**Remove dead code.** The unreachable `[data-theme='system']` block came out of tokens.css.
`resolveTheme` only ever yields light or dark, so that block could never apply.

**Three interactive primitives.** The chrome now has a shared vocabulary for its three
recurring idioms. `SectionLabel` (`ds-section-label`) is the uppercase, 600-weight,
`--font-size-xs`, 0.09em label in the one canonical muted color. `IconButton`
(`ds-icon-button`) is the square icon button, with a labeled variant and a readout variant,
sized by a new `--size-control-icon` token. `Segmented` (`ds-segmented` /
`ds-segmented__option` / `is-active`) is the single segmented-control treatment.

**Route every call site through the primitives.** The roughly ten hand-rolled button idioms
and the previously unstyled raw buttons now go through `Button`, `IconButton`, `Segmented`,
and `SectionLabel`: the command palette, the library filters and launcher, the project and
export menus, the shell header icon buttons and zoom control, the view-mode and floor tabs,
the finish-section chips, the unit and theme toggles, the tool-rail chips, and the four
copy-pasted section labels.

**One active treatment (the key decision).** The five drifted active treatments collapse to
the single canonical `ds-segmented__option.is-active`: a `--color-surface-active` background
with a border. The tool-rail chip's brass left-border active indicator is replaced by this
surface-active treatment. Brass (`--color-accent` / `--color-indicator`) is reserved for the
primary action (Export/Save) and for annotations and period tags per ADR-0069, not for
control active states. The disabled treatment likewise gets one home,
`ds-segmented__option:disabled`.

**One canonical section-label color.** Section labels resolve to `--color-text-muted`. The
tools-panel, the overall-dimensions readout, and the inspector "Properties" title shifted
from `--color-text` to muted (the finish-section was already muted). The inspector
"Properties" h2 and the finish "Finish" h3 became `SectionLabel` spans. This is not a
landmark regression: the inspector panel is an `<aside aria-label="Inspector">` and keeps
its EB Garamond component title as the heading.

**Heading face for the wordmark.** The wordmark adopts `--font-family-heading` (EB Garamond)
at `--font-size-xl`, and the rail project name moves to `--font-size-lg`.

**Layout nit.** The tool-chip grid drops to a single column at the default rail width
(about 11rem), so the chip labels no longer clip.

**A literal guard, and why not stylelint.** A dependency-free vitest scanner
(`editor/design-system/css-literal-guard.test.ts`) bans raw numeric `font-size`,
`border-radius`, and `font:` shorthand sizes anywhere in editor CSS outside tokens.css. We
deliberately did not add stylelint: a new dependency would need an exact pin at least 30
days old under the `.npmrc` release-age cooldown plus a change to the lint chain, while the
scanner is enforceable today with zero new dependencies. All of the roughly 25 residual
literals migrated to scale and radius tokens, snapped to the nearest step (with small
intentional shifts on badges, period tags, captions, and canvas-overlay labels).

## Consequences

- A change to a section label, an icon button, or a segmented option now lands in one
  primitive and propagates everywhere, instead of being copied across panels.
- The active and disabled treatments each have a single home. Brass is now consistently the
  primary-action and annotation color, never a control state, which keeps the ADR-0069
  distinction between UI state and drawing annotation intact.
- The downstream polish issues get much smaller. #234 (target sizes), #235 (contrast), #244
  (disabled affordance), #247 (action dominance), and #228 / #239 / #249 (unstyled surfaces)
  each now have one place to change a treatment rather than many call sites.
- The token scales are complete enough that new chrome can reach for a step instead of a
  literal, and the literal guard fails the build if it does not. The guard runs in the
  existing vitest suite, so there is no new tool and no new dependency to cool down.
- A few values moved by a hair (the 0.68rem labels to 0.7rem, the snapped badge and caption
  sizes). The shift is deliberate and within the visual tolerance of the language.

## Deferred and follow-ups

- Tokenize the focus-ring geometry, which is still expressed as raw outline lengths.
- Add a `--opacity-disabled` token; a TODO sits beside the `ds-segmented__option:disabled`
  0.5 opacity that points at it.
- An optional `as` or heading prop on `SectionLabel`, for the cases where a label should
  render as a real heading element rather than a span.
- Adopt stylelint once a release-age-cooled-down version is available, replacing the
  hand-rolled scanner with the standard tool. The scanner is the bridge until then.

## References

- ADR-0069 (Draughtsman's Restraint, the visual language this consolidates onto), ADR-0076
  (wordmark typeface), ADR-0081 (canvas resolves design tokens at runtime).
- Downstream polish issues this consolidation unblocks: #234 (target sizes), #235
  (contrast), #244 (disabled affordance), #247 (action dominance), #228 / #239 / #249
  (unstyled surfaces).
