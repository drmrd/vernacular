---
slug: decisions/ADR-0154-arris-visual-design-language
title: 'ADR-0154: Adopt Arris as the target visual design language'
type: decision
tags: [design-system, visual-language, theming, color, typography, iconography, accessibility]
related:
  [
    decisions/ADR-0069-visual-design-language-draughtsmans-restraint,
    decisions/ADR-0096-design-system-consolidation,
  ]
sourceFiles:
  [
    docs/specs/2026-07-06-arris-visual-design-language.md,
    docs/specs/2026-06-13-visual-design-language.md,
    editor/design-system/tokens.css,
    editor/design-system/tokens.ts,
  ]
status: proposed
updated: 2026-07-06
---

# ADR-0154: Adopt Arris as the target visual design language

## Status

Proposed. Chosen by the owner on 2026-07-06 as the outcome of a purpose-first UX review of the
whole product surface. Arris is adopted as the target visual and interaction language and is
recorded as a spec (`docs/specs/2026-07-06-arris-visual-design-language.md`). It is not yet in
force. The shipped editor implements Draughtsman's Restraint
([[ADR-0069-visual-design-language-draughtsmans-restraint]]), which stays current until an
incremental migration lands. This ADR records the decision to aim for Arris and migrate toward
it, not a completed replacement.

## Context

Vernacular's shipped visual language is Draughtsman's Restraint (ADR-0069): a warm vellum
palette, a brass accent, EB Garamond with Inter, and Phosphor icons. It is approved and live in
`editor/design-system/tokens.css` and `tokens.ts`.

A purpose-first UX review redesigned the whole product surface. Each area was designed from a
function-only brief, critiqued for both power-user efficiency and coherence, then reconciled with
its neighbors into one language. The designers worked blind to the current implementation on
purpose, so the result answers "what should this product look and feel like" without anchoring to
what already ships. That review produced Arris.

Arris differs from Draughtsman's Restraint at the level of the language, not the token values. The
palette is a cooler paper-and-bench pairing with a blue instrument accent that never fills a
surface and a red accent reserved for destructive actions and data-loss warnings. The typefaces
are self-hosted and openly licensed (Besley, Atkinson Hyperlegible Next, B612 Mono) rather than
loaded from a web font service. State reads through inversion first and hue second, where the
shipped language leans on a brass accent fill. Iconography is a custom stroke set that draws
period artifacts correctly rather than a general-purpose icon library. Adopting Arris is therefore
a migration of the design system, not a retuning of the existing one.

Because the review was blind to the codebase, Arris is a direction validated on paper, not a
mapped-and-measured implementation plan. Its signature behaviors (felt detents and seat flashes,
live-length readouts on large plans, a luminance-adaptive keyline that holds contrast over any
finish, and keyboard reach under assistive technology) are asserted by the design, not yet proven
against the real engine. Recording Arris as current and shipped would misstate what the product
does today and would promise a look the code does not yet render.

## Decision

Adopt Arris as the target visual design language and record it as a spec at proposed status.

- **Draughtsman's Restraint remains current.** This ADR does not supersede ADR-0069. The shipped
  language stays authoritative for what the product renders today; Arris is the destination it
  points toward. ADR-0069 gains a dated forward pointer to this decision.
- **Migration is incremental and staged, not a single cutover.** The palette and token files, the
  palette-contrast tests, the typeface loading and license path, the iconography, and the
  design-system Storybook stories each move on their own slice, so the shipped app is never left
  half-migrated between two languages.
- **Each signature behavior earns a feasibility pass before it becomes a build commitment.** The
  spec's Open questions section enumerates the prototypes and measurements owed: detent feel and
  latency, live-geometry performance envelopes, the luminance-adaptive keyline, and assistive-
  technology reach. A behavior graduates from the spec to a build slice only after it is
  measured.
- **Arris becomes current only when the shipped app implements it.** At that point this ADR flips
  to current and ADR-0069 flips to superseded, following the repository's supersession practice.
  Until then the spec reads as a target.

## Consequences

- The durable design record now names one chosen direction, so future design and build work
  converges on Arris instead of re-deriving a language each time.
- The shipped app is unchanged by this decision. No tokens, tests, or components move here; this is
  direction-setting, not implementation. A reader who diffs the running editor against the Arris
  spec will find they disagree, and that is expected until migration.
- Because Arris is proposed and unshipped, no README, release note, or other external text may
  describe the product as looking like Arris. The shipped language is still Draughtsman's
  Restraint, and version 0.x makes no visual-stability promise regardless.
- The migration is large: palette, accent doctrine, typefaces, and iconography all change.
  Downstream specs that assume Draughtsman's Restraint (the editor visual-design-quality pass, the
  token contract) will need reconciliation as slices land. Those reconciliations happen with the
  slices, not in this ADR.
- The Arris spec carries its own open questions and unvalidated claims. Promotion of any specific
  Arris behavior into build work waits on the feasibility pass that maps it onto the shipped
  architecture, schema, and renderer.

## References

- [[ADR-0069-visual-design-language-draughtsmans-restraint]]: the shipped language Arris targets
  and would eventually supersede; it stays current until the migration lands.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: the Arris spec this decision adopts.
- `docs/specs/2026-06-13-visual-design-language.md`: the shipped Draughtsman's Restraint spec.
- `docs/specs/2026-06-14-editor-visual-design-quality.md`: a quality pass written within
  Draughtsman's Restraint that a migration will need to reconcile.
- `docs/specs/2026-06-09-design-system-token-and-theming-contract.md`: the token contract the
  migration retargets.
