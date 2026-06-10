# Design-system token and theming contract

A short track-foundation note for the user-experience foundation track (ADR-0044).
It pins the cross-slice decisions that every later polish slice depends on: where
the design system lives, the token taxonomy, and the theming mechanism. The full
first-slice implementation steps live in
`docs/plans/2026-06-09-design-system-foundation.md`. This note is the durable
contract; the plan is the build order.

This note records implementation conventions for a track introduced by ADR-0044
and does not modify the design specification or any decision record. The
authoritative product requirements remain design specification sections 7.7
(settings and theming) and 7.9 (accessibility).

## Location

The design system lives at `editor/design-system/` as a new directory inside the
existing `editor/` layer. It is not a new top-level layer, because the layer set is
fixed in `eslint.config.js` (`eslint-plugin-boundaries`), `vite.config.ts`
(coverage globs), and the tsconfig project references; a new top-level directory
would require editing those shared configs. `editor/` already imports `core/`, is a
Storybook story root, and is a coverage root, so it is the zero-config additive
home. Components are React and consume only token variables; the pure
theme-resolution helper is unit-tested in the same directory.

## Token taxonomy

Two tiers. Components reference only the semantic tier.

1. **Primitive (raw) tokens** name raw values and are the only place raw hex,
   rem literals, and durations appear. The starting ramp is drawn from the colors
   already used across `editor/shell/editor-shell.css` and
   `editor/plan/plan-overlay.css` so the first adoption is a faithful re-expression,
   not a redesign: a slate ramp (`#1e293b`, `#475569`, `#64748b`, `#cbd5e1`,
   `#e2e8f0`, `#f8fafc`, `#ffffff`) and a blue accent ramp (`#1a7fd4`, `#1670c9`,
   `#0b5394`).

2. **Semantic (role) tokens** name intent and reference the primitives. The
   contract:
   - Color: `--color-text`, `--color-text-muted`, `--color-surface`,
     `--color-surface-raised`, `--color-border`, `--color-accent`,
     `--color-accent-strong` (the WCAG-AA-safe text-on-fill accent),
     `--color-focus-ring`.
   - Spacing: `--space-1` through `--space-5` (a rem scale).
   - Radius: `--radius-sm`, `--radius-md`.
   - Typography: `--font-size-sm`, `--font-size-md`, `--font-size-lg`,
     `--font-family-ui` (the system font stack).
   - Motion: `--motion-duration` (zeroed under reduced motion).

A typed registry (`editor/design-system/tokens.ts`) names every token so primitives
and tests reference tokens by symbol, and a unit test pins the registry against the
stylesheet (every named token is declared in `tokens.css`).

## Theming mechanism

Theming flips the semantic color tokens via CSS custom properties.

- **Light is the default `:root` block.**
- **Dark** is a `[data-theme='dark']` block that re-points the semantic color
  tokens. A `ThemeProvider` sets `data-theme` on its wrapper to the resolved theme.
- **System** follows the OS: the provider watches `prefers-color-scheme` and the
  pure `resolveTheme(choice, prefersDark)` maps the choice to `light` or `dark`. The
  stylesheet also reserves a `[data-theme='system']` block under
  `@media (prefers-color-scheme: dark)` as a forward hook for applying the choice on
  the document root.
- **High contrast** (`@media (prefers-contrast: more)`) strengthens the border and
  focus-ring tokens.
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)`) sets
  `--motion-duration` to `0ms`, so any future animated primitive opts out by reading
  the token.

The theme choice (`light` / `dark` / `system`) is held in React state in the
foundation slice. Persisting it in `LibraryStore` (specification section 7.7) is
deferred to the settings slice that owns that store.

## Authoring rules for every later slice

- Reference only semantic `var(--...)` tokens in component CSS. Raw values live
  only in `tokens.css`.
- Do not migrate existing editor components onto the tokens in the foundation
  slice. Continuous per-surface polish is its own later work (ADR-0044), kept
  separate to avoid churn and merge conflicts with parallel tracks that also touch
  `editor/`.
- Assert computed color and contrast only in a real browser (Storybook or
  Playwright), never in a jsdom unit test, where custom properties do not resolve.

## References

- ADR-0044 (the user-experience foundation track and the design-system foundation
  as a start-now dependency reducer).
- ADR-0043 (the DOM overlay and editor accessibility this foundation supports) and
  ADR-0021 (the Canvas seam; the design system is DOM chrome, not Canvas rendering).
- Design specification sections 7.7 (settings and theming via CSS custom properties,
  light/dark/system, high contrast) and 7.9 (accessibility commitments:
  reduced-motion, semantic UI, keyboard, focus).
- Implementation plan: `docs/plans/2026-06-09-design-system-foundation.md`.
