# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an additive design-system foundation (design tokens, a CSS-custom-property theming contract with light/dark/system + high-contrast + reduced-motion, and a small set of accessible component primitives) as new modules under `editor/design-system/`, without rewriting any existing editor component.

**Architecture:** A single global token stylesheet (`tokens.css`) declares the design vocabulary as CSS custom properties on `:root`, switched by a `data-theme` attribute and the `prefers-color-scheme` / `prefers-contrast` / `prefers-reduced-motion` media queries. A typed token registry in TypeScript names the tokens so primitives and tests reference them by symbol rather than raw strings, and a pure `resolveTheme` function plus a thin React `ThemeProvider` own the light/dark/system selection. Component primitives (`Button`, then a `Stack` layout primitive and `EmptyState` / `LoadingState` status primitives) are small, accessible React components that consume only token variables, never raw hex. Everything is brand-new code in a new directory; no existing component is modified, so the slice cannot conflict with the three-dimensional-preview track or any other parallel track that touches `editor/`.

**Tech Stack:** TypeScript (strict), React 19, plain CSS custom properties (no styling library), Vitest + Testing Library (unit), Storybook CSF with `storybook/test` (visual + interaction), Playwright + axe (accessibility / visual regression, exercised only at the optional final task).

---

## Why this lives in `editor/design-system/` and not a new top-level layer

The repository's layer boundaries are enforced by `eslint.config.js` (`eslint-plugin-boundaries`), whose `layerElements` and `layerRules` enumerate a fixed set of layers: `core`, `storage`, `engine`, `bridge`, `editor`, `app`. There is no `design-system` layer. Coverage globs in `vite.config.ts` and the `tsconfig` project references mirror that same set. Creating a brand-new top-level `design-system/` directory would therefore require editing `eslint.config.js`, `vite.config.ts`, and the tsconfig files, all of which this slice is forbidden to touch and all of which are shared files that other tracks also depend on.

`editor/` is already a registered boundary layer that may import `core/` (the layer that owns pure domain types), is already a Storybook story root (`../editor/**/*.stories.@(ts|tsx)`), is already a Vitest coverage root, and is already where every React UI component lives. Nesting the design system at `editor/design-system/` is therefore the smallest, zero-config, fully additive home. The directory name reads as plain English and carries no internal shorthand.

The token _resolution_ logic (which theme is active given a stored preference and the OS setting) is pure and could in principle live in `core/`, but design tokens are inherently a UI and CSS concern, the consumers are all React, and `core/` must not grow UI vocabulary. Keeping the whole foundation under `editor/design-system/` keeps one cohesive module and avoids splitting a small slice across two layers.

---

## File Structure

All paths are relative to the repository root (`/Users/dan/workspace/vernacular.wt/design-system/`). Every file is **new**. No existing file is modified by Tasks 1 through 6. The single optional wiring touch is called out explicitly in Task 7 and is gated behind a clear coordination note.

**New directory:** `editor/design-system/`

| File                                             | Responsibility                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor/design-system/tokens.css`                | The token vocabulary as CSS custom properties on `:root`; the `data-theme="dark"` overrides; the `prefers-color-scheme`, `prefers-contrast: more`, and `prefers-reduced-motion: reduce` media-query overrides. The single source of truth for color, spacing, radius, typography, and elevation values. |
| `editor/design-system/tokens.ts`                 | A typed, frozen registry naming every token (its CSS custom-property name and a `var(--name)` accessor). Lets primitives and tests reference tokens by symbol, not by raw string, and gives a compile-time list of the contract.                                                                        |
| `editor/design-system/tokens.test.ts`            | Unit tests over `tokens.ts`: every registry entry's accessor is `var(<custom-property-name>)`; the custom-property name appears as a declaration in `tokens.css`; the registry has no duplicate names. Pins the token-name-to-stylesheet contract.                                                      |
| `editor/design-system/theme.ts`                  | The pure theme model: the `ThemeChoice` (`'light'                                                                                                                                                                                                                                                       | 'dark'                                                         | 'system'`) and `ResolvedTheme` (`'light' | 'dark'`) types, and `resolveTheme(choice, prefersDark)` that maps a choice plus the OS dark-mode flag to a resolved theme. No React, no DOM. |
| `editor/design-system/theme.test.ts`             | Unit tests over `resolveTheme`: the truth table for all six (choice x prefersDark) combinations.                                                                                                                                                                                                        |
| `editor/design-system/theme-provider.tsx`        | The React `ThemeProvider`: owns the `ThemeChoice` state, watches `prefers-color-scheme` via `matchMedia`, writes the resolved theme onto a container's `data-theme`, and exposes the choice and a setter through context (`useTheme`). A thin DOM-coupled wrapper around the pure `resolveTheme`.       |
| `editor/design-system/theme-provider.test.tsx`   | Unit tests (jsdom): the provider renders children, applies `data-theme` reflecting the resolved theme, defaults to `system`, and `useTheme().setChoice` updates the applied attribute.                                                                                                                  |
| `editor/design-system/button.tsx`                | The `Button` primitive: a semantic `<button>` that forwards `type`, `disabled`, `aria-*`, `onClick`, `children`, and a `variant` (`'primary'                                                                                                                                                            | 'neutral'`), applying token-driven classes. No business logic. |
| `editor/design-system/button.css`                | Token-only styling for `Button` variants, focus-visible ring, and disabled state. References `var(--...)` tokens exclusively; no raw hex.                                                                                                                                                               |
| `editor/design-system/button.test.tsx`           | Unit tests over `Button`: renders an accessible button with its label, defaults `type` to `button`, forwards `onClick` and `disabled`, applies the variant class, and forwards `aria-pressed`.                                                                                                          |
| `editor/design-system/stack.tsx`                 | The `Stack` layout primitive: a `<div>` that lays children out vertically or horizontally with a token-scale `gap`, via token-driven classes and an inline `--stack-gap` custom property.                                                                                                               |
| `editor/design-system/stack.css`                 | Token-only flex layout for `Stack`; reads the `--stack-gap` custom property the component sets from the spacing scale.                                                                                                                                                                                  |
| `editor/design-system/stack.test.tsx`            | Unit tests over `Stack`: renders children, applies the direction class, and sets the gap custom property from the named spacing step.                                                                                                                                                                   |
| `editor/design-system/status.tsx`                | The `EmptyState` and `LoadingState` status primitives: small accessible blocks for "nothing here yet" and "loading" surfaces, with the correct ARIA roles (`status` for loading, a labeled region for empty).                                                                                           |
| `editor/design-system/status.css`                | Token-only styling for the status primitives.                                                                                                                                                                                                                                                           |
| `editor/design-system/status.test.tsx`           | Unit tests over the status primitives: `LoadingState` exposes `role="status"` and its message; `EmptyState` renders its title, optional description, and optional action slot.                                                                                                                          |
| `editor/design-system/index.ts`                  | The public surface of the design system: re-exports the primitives, the theme provider and hook, the resolved-theme types, and the token registry. The one import other layers will eventually use.                                                                                                     |
| `editor/design-system/design-system.stories.tsx` | A Storybook story file demonstrating the primitives under both themes, used for the visual / interaction checks that unit tests cannot make (color, contrast, focus ring appearance, theme switching). Includes a `storybook/test` play function for an axe-style interaction smoke check.              |

**Not modified in this slice:** `editor/shell/editor-shell.css`, `editor/shell/editor-shell.tsx`, `editor/tools/tools-panel.tsx`, `editor/index.ts`, `app/`, `src/main.tsx`, `index.html`, `eslint.config.js`, `vite.config.ts`, `.storybook/*`, `package.json`, the lockfile, and every other existing file. The existing components keep their co-located CSS and hard-coded colors; migrating them to tokens is explicitly a later polish slice (ADR-0044, "continuous polish on each surface as it lands"), kept out of this slice to avoid churn and merge conflicts.

---

## What is unit-testable vs. what needs a visual / Storybook check

Be explicit so the RGB cycles target the right tool:

- **Unit-testable (Vitest + Testing Library), and where the RED tests live:**
  - The token registry contract: every named token resolves to `var(<its-custom-property>)`, every custom-property name is declared in `tokens.css`, no duplicate names (Task 1). `tokens.css` is read as a text file in the test and scanned for the declaration; this verifies the TS-name-to-CSS-name contract without needing a real cascade.
  - The pure `resolveTheme` truth table (Task 2).
  - The `ThemeProvider` behavior: default choice, `data-theme` attribute reflecting the resolved theme, and the setter updating it (Task 3). jsdom does not compute styles, but it does reflect attributes and run `matchMedia` (mocked), so attribute application is fully assertable.
  - Each primitive's markup, roles, ARIA, prop forwarding, and applied class names (Tasks 4, 5, 6).
- **NOT unit-testable (jsdom does not apply CSS custom properties or compute the cascade), so verified visually in Storybook and, optionally, by Playwright:**
  - Whether a token actually renders the intended color, whether dark theme visibly changes, whether text-on-fill clears WCAG AA contrast, and whether the focus-visible ring is visible. These are asserted by the Storybook stories (Task 7) and, optionally, by a Playwright axe pass and a visual-regression snapshot (Task 8, optional).

A unit test asserting a _computed_ color from a custom property would be a false test under jsdom (it returns the empty string), so the plan never writes one; computed-style and contrast claims are made only where a real browser runs them.

---

## The token taxonomy (the cross-slice contract)

Recorded here so every later polish slice consumes the same vocabulary. Two tiers:

1. **Primitive (raw) tokens** name raw values: a slate-and-blue ramp drawn from the colors already in `editor/shell/editor-shell.css` and `editor/plan/plan-overlay.css` (for example `#1e293b`, `#475569`, `#e2e8f0`, `#cbd5e1`, `#f8fafc`, and the accents `#1a7fd4`, `#1670c9`, `#0b5394`), a spacing scale in `rem`, a radius scale, a type scale, and a focus-ring color. These are the only place raw hex appears.
2. **Semantic (role) tokens** name intent and reference the primitives: `--color-text`, `--color-text-muted`, `--color-surface`, `--color-border`, `--color-accent`, `--color-accent-strong` (the AA-safe text-on-fill accent), `--color-focus-ring`, `--space-1` through `--space-5`, `--radius-sm` / `--radius-md`, `--font-size-sm` / `--font-size-md` / `--font-size-lg`, and the system font stack `--font-family-ui`. Components reference only semantic tokens.

Theming flips the _semantic_ tokens. The light theme is the default `:root` block. The dark theme is a `[data-theme='dark']` block (and the same block under `@media (prefers-color-scheme: dark)` when the choice is `system`) that re-points the semantic color tokens at different primitive values. High contrast (`@media (prefers-contrast: more)`) strengthens borders and the focus ring. Reduced motion (`@media (prefers-reduced-motion: reduce)`) sets a `--motion-duration` token to `0ms` so any future animated primitive opts out by reading the token.

This taxonomy and the `data-theme` switching mechanism are the cross-slice decisions; they are also captured in the short track-foundation note at `docs/specs/2026-06-09-design-system-token-and-theming-contract.md` written alongside this plan.

---

## Conventions every task must honor

- **Red-green-blue:** each behavior gets a failing test first, then the minimal implementation, then a Clean Code pass. The BLUE phase ends with a `refactor:` commit even when empty.
- **Conventional Commits**, descriptive subjects, no milestone tags, no `Co-Authored-By`, no em-dashes.
- **ESLint zero-problems** including warnings: keep functions under 40 lines, files under 300, three params or fewer (use an options object beyond that), no nested ternaries, and no magic numbers (lift to named `const`s; token-scale numbers belong in `tokens.ts` named entries, not inline).
- **No raw hex in any `.tsx` or in any component `.css` except `tokens.css`.** Components reference `var(--semantic-token)`; `tokens.css` is the only place raw values live.
- **Run the focused test before and after each implementation step.** Use `pnpm exec vitest run <path>` (the project memo notes `pnpm test -- <x>` does not filter and breaks `--coverage`).

---

### Task 1: Design tokens and the typed token registry

**Files:**

- Create: `editor/design-system/tokens.css`
- Create: `editor/design-system/tokens.ts`
- Test: `editor/design-system/tokens.test.ts`

This is the **first RGB cycle**. The RED behavior below is the one the orchestrator dispatches to the test-author verbatim.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { tokens, tokenList } from './tokens'

const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

describe('design tokens', () => {
  it('exposes a non-empty list of named tokens', () => {
    expect(tokenList.length).toBeGreaterThan(0)
  })

  it('gives every token a var() accessor over its custom property name', () => {
    for (const token of tokenList) {
      expect(token.variable).toBe(`var(${token.name})`)
    }
  })

  it('names every token as a CSS custom property (leading --)', () => {
    for (const token of tokenList) {
      expect(token.name.startsWith('--')).toBe(true)
    }
  })

  it('declares every named token in tokens.css', () => {
    for (const token of tokenList) {
      expect(tokensCss).toContain(`${token.name}:`)
    }
  })

  it('has no duplicate token names', () => {
    const names = tokenList.map((token) => token.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('exposes the core semantic roles by key', () => {
    expect(tokens.colorText.name).toBe('--color-text')
    expect(tokens.colorSurface.name).toBe('--color-surface')
    expect(tokens.colorAccentStrong.name).toBe('--color-accent-strong')
    expect(tokens.colorFocusRing.name).toBe('--color-focus-ring')
    expect(tokens.space2.name).toBe('--space-2')
    expect(tokens.radiusMd.name).toBe('--radius-md')
    expect(tokens.fontFamilyUi.name).toBe('--font-family-ui')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`
Expected: FAIL (cannot resolve `./tokens` and `./tokens.css` do not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/tokens.ts`. Define a `Token` shape, build each entry from its custom-property name, and freeze the registry. Keep the accessor derivation in one helper so the `var()` rule is not repeated:

```ts
export interface Token {
  readonly name: `--${string}`
  readonly variable: string
}

function token(name: `--${string}`): Token {
  return { name, variable: `var(${name})` }
}

export const tokens = {
  colorText: token('--color-text'),
  colorTextMuted: token('--color-text-muted'),
  colorSurface: token('--color-surface'),
  colorSurfaceRaised: token('--color-surface-raised'),
  colorBorder: token('--color-border'),
  colorAccent: token('--color-accent'),
  colorAccentStrong: token('--color-accent-strong'),
  colorFocusRing: token('--color-focus-ring'),
  space1: token('--space-1'),
  space2: token('--space-2'),
  space3: token('--space-3'),
  space4: token('--space-4'),
  space5: token('--space-5'),
  radiusSm: token('--radius-sm'),
  radiusMd: token('--radius-md'),
  fontSizeSm: token('--font-size-sm'),
  fontSizeMd: token('--font-size-md'),
  fontSizeLg: token('--font-size-lg'),
  fontFamilyUi: token('--font-family-ui'),
  motionDuration: token('--motion-duration'),
} as const

export const tokenList: readonly Token[] = Object.values(tokens)
```

Create `editor/design-system/tokens.css`. Declare the primitive ramp, map the semantic tokens to primitives in the default (light) `:root`, then re-point the semantic colors for dark, high-contrast, and reduced-motion. Raw hex appears here and nowhere else:

```css
/*
 * The design-system token vocabulary. This is the only stylesheet that holds raw
 * color values; every component references the semantic var(--...) tokens below.
 * Light is the default :root. Dark flips the semantic color tokens, both when the
 * user explicitly chooses dark (data-theme="dark") and when the choice is "system"
 * and the OS prefers dark. High contrast strengthens borders and the focus ring;
 * reduced motion zeroes the shared motion-duration token.
 */

:root {
  /* Primitive ramp (raw values live only here). */
  --slate-900: #1e293b;
  --slate-600: #475569;
  --slate-500: #64748b;
  --slate-300: #cbd5e1;
  --slate-200: #e2e8f0;
  --slate-50: #f8fafc;
  --white: #ffffff;
  --blue-400: #1a7fd4;
  --blue-600: #1670c9;
  --blue-800: #0b5394;

  /* Semantic (role) tokens: light theme defaults. */
  --color-text: var(--slate-900);
  --color-text-muted: var(--slate-600);
  --color-surface: var(--white);
  --color-surface-raised: var(--slate-50);
  --color-border: var(--slate-200);
  --color-accent: var(--blue-400);
  --color-accent-strong: var(--blue-800);
  --color-focus-ring: var(--blue-400);

  /* Spacing scale (rem). */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;

  /* Radius scale. */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;

  /* Type scale. */
  --font-size-sm: 0.85rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.25rem;
  --font-family-ui: system-ui, -apple-system, sans-serif;

  /* Motion. */
  --motion-duration: 150ms;
}

[data-theme='dark'] {
  --color-text: var(--slate-50);
  --color-text-muted: var(--slate-300);
  --color-surface: var(--slate-900);
  --color-surface-raised: var(--slate-600);
  --color-border: var(--slate-600);
  --color-accent: var(--blue-400);
  --color-accent-strong: var(--blue-400);
  --color-focus-ring: var(--blue-400);
}

@media (prefers-color-scheme: dark) {
  [data-theme='system'] {
    --color-text: var(--slate-50);
    --color-text-muted: var(--slate-300);
    --color-surface: var(--slate-900);
    --color-surface-raised: var(--slate-600);
    --color-border: var(--slate-600);
    --color-accent: var(--blue-400);
    --color-accent-strong: var(--blue-400);
    --color-focus-ring: var(--blue-400);
  }
}

@media (prefers-contrast: more) {
  :root {
    --color-border: var(--slate-600);
    --color-focus-ring: var(--blue-800);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration: 0ms;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Lint the new files**

Run: `pnpm exec eslint editor/design-system/tokens.ts editor/design-system/tokens.test.ts`
Expected: zero problems. (If `no-magic-numbers` flags the spacing literals, note they live only inside `tokens.css`, not `tokens.ts`; `tokens.ts` holds only strings, so this should pass.)

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/tokens.ts editor/design-system/tokens.css editor/design-system/tokens.test.ts
git commit -m "feat: add design tokens and a typed token registry"
```

- [ ] **Step 7: BLUE review and refactor**

Review against `.claude/rules.md`: the `var()` rule is derived once in `token()`, raw values live only in `tokens.css`, names are descriptive, no duplication. Apply any Clean Code fixes; if none, land the empty marker commit.

```bash
git commit --allow-empty -m "refactor: design tokens and registry (no changes needed)"
```

---

### Task 2: The pure theme-resolution model

**Files:**

- Create: `editor/design-system/theme.ts`
- Test: `editor/design-system/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('resolves an explicit light choice to light regardless of the OS', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('resolves an explicit dark choice to dark regardless of the OS', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('follows the OS when the choice is system', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/theme.test.ts`
Expected: FAIL (cannot resolve `./theme`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/theme.ts`:

```ts
export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') {
    return prefersDark ? 'dark' : 'light'
  }
  return choice
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/theme.ts editor/design-system/theme.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/theme.ts editor/design-system/theme.test.ts
git commit -m "feat: add the pure theme-resolution model"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the function is a single small mapping, types are explicit unions, no DOM. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: theme-resolution model (no changes needed)"
```

---

### Task 3: The ThemeProvider and useTheme hook

**Files:**

- Create: `editor/design-system/theme-provider.tsx`
- Test: `editor/design-system/theme-provider.test.tsx`

The provider applies the resolved theme onto its own wrapper element's `data-theme` and exposes the choice plus a setter. It watches `prefers-color-scheme` so a `system` choice follows the OS live.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/theme-provider.test.tsx`. Mock `matchMedia` (jsdom does not implement it) so the OS dark-mode flag is controllable:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './theme-provider'

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  mockMatchMedia(false)
})

function ThemeReadout() {
  const { choice, setChoice } = useTheme()
  return (
    <>
      <p>choice: {choice}</p>
      <button onClick={() => setChoice('dark')}>Go dark</button>
    </>
  )
}

describe('ThemeProvider', () => {
  it('renders children inside a themed container', () => {
    render(
      <ThemeProvider>
        <p>hello</p>
      </ThemeProvider>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('defaults to the system choice and applies the OS-resolved theme', () => {
    mockMatchMedia(false)
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(screen.getByText('choice: system')).toBeInTheDocument()
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('light')
  })

  it('resolves dark when the OS prefers dark and the choice is system', () => {
    mockMatchMedia(true)
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('dark')
  })

  it('applies the chosen theme when setChoice is called', async () => {
    const { container } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))
    })
    expect(screen.getByText('choice: dark')).toBeInTheDocument()
    expect(container.querySelector('[data-theme]')?.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/theme-provider.test.tsx`
Expected: FAIL (cannot resolve `./theme-provider`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/theme-provider.tsx`. Keep the OS-preference read in a small hook so the component body stays a declaration; resolve through the pure `resolveTheme`; ensure the token stylesheet is loaded by importing it here so any consumer of the provider gets the variables:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveTheme, type ResolvedTheme, type ThemeChoice } from './theme'
import './tokens.css'

interface ThemeContextValue {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

// Tracks the OS dark-mode preference live so a "system" choice follows it without
// a reload. matchMedia is mocked under jsdom; the listener is a no-op there.
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => globalThis.matchMedia?.(DARK_QUERY).matches ?? false,
  )
  useEffect(() => {
    const query = globalThis.matchMedia?.(DARK_QUERY)
    if (!query) {
      return
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return prefersDark
}

export interface ThemeProviderProps {
  children: ReactNode
  defaultChoice?: ThemeChoice
}

export function ThemeProvider({ children, defaultChoice = 'system' }: ThemeProviderProps) {
  const [choice, setChoice] = useState<ThemeChoice>(defaultChoice)
  const resolved = resolveTheme(choice, usePrefersDark())
  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>
      <div className="design-system-theme" data-theme={resolved}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === null) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return value
}
```

Note on the `data-theme` value: the wrapper carries the _resolved_ theme (`light` or `dark`) for the explicit-choice and high-contrast cascades, which is sufficient for this slice. The `[data-theme='system']` selector in `tokens.css` is the documented hook for a future enhancement that applies the choice (not the resolution) on the document root; it does not gate this slice and is exercised by the stylesheet text test, not the cascade.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/theme-provider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/theme-provider.tsx editor/design-system/theme-provider.test.tsx`
Expected: zero problems. Watch `max-lines-per-function` on `ThemeProvider` and `usePrefersDark`; both are under 40 lines as written.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/theme-provider.tsx editor/design-system/theme-provider.test.tsx
git commit -m "feat: add the theme provider and useTheme hook"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the OS-preference read is isolated in `usePrefersDark`, resolution reuses the pure function, the hook throws a concrete error outside a provider (no null returned). Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: theme provider (no changes needed)"
```

---

### Task 4: The Button primitive

**Files:**

- Create: `editor/design-system/button.tsx`
- Create: `editor/design-system/button.css`
- Test: `editor/design-system/button.test.tsx`

`Button` is the most-reused primitive (the tools panel, project controls, and recovery prompt all render bare `<button>`s with ad-hoc styles today). It ships first so later polish slices have one accessible, token-driven button to adopt.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/button.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

afterEach(cleanup)

describe('Button', () => {
  it('renders an accessible button with its label', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('defaults the type to button so it never submits a form', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('forwards the click handler', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('forwards the disabled state', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('applies the primary variant class', () => {
    render(<Button variant="primary">Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('ds-button--primary')
  })

  it('defaults to the neutral variant', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('ds-button--neutral')
  })

  it('forwards aria-pressed for toggle buttons', () => {
    render(<Button aria-pressed>Grid</Button>)
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/button.test.tsx`
Expected: FAIL (cannot resolve `./button`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/button.tsx`. Forward the native button props, default `type` and `variant`, and compose the class name:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './button.css'

export type ButtonVariant = 'primary' | 'neutral'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({
  variant = 'neutral',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ds-button', `ds-button--${variant}`, className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
```

Create `editor/design-system/button.css`, token-only:

```css
.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-family-ui);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.ds-button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.ds-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* The strong accent keeps white label text above the WCAG AA 4.5:1 threshold. */
.ds-button--primary {
  border-color: var(--color-accent-strong);
  background: var(--color-accent-strong);
  color: var(--white);
}

.ds-button--neutral {
  background: var(--color-surface-raised);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/button.tsx editor/design-system/button.test.tsx`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/button.tsx editor/design-system/button.css editor/design-system/button.test.tsx
git commit -m "feat: add the Button design-system primitive"
```

- [ ] **Step 7: BLUE review and refactor**

Review: native props are forwarded (no prop re-invention), defaults are explicit, the class join is a single expression, CSS references only tokens, and the `--white` use on the primary fill is the one deliberate raw-token reference for AA text (documented inline). Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: Button primitive (no changes needed)"
```

---

### Task 5: The Stack layout primitive

**Files:**

- Create: `editor/design-system/stack.tsx`
- Create: `editor/design-system/stack.css`
- Test: `editor/design-system/stack.test.tsx`

`Stack` is the minimal layout-shell scaffolding: a flex container with a token-scale gap and a direction. It is enough to compose primitives without ad-hoc inline styles, and it is the seed the future full layout shell extends.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/stack.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Stack } from './stack'

afterEach(cleanup)

describe('Stack', () => {
  it('renders its children', () => {
    render(
      <Stack>
        <span>a</span>
        <span>b</span>
      </Stack>,
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
  })

  it('defaults to a vertical stack', () => {
    const { container } = render(
      <Stack>
        <span>a</span>
      </Stack>,
    )
    expect(container.firstChild).toHaveClass('ds-stack--vertical')
  })

  it('applies the horizontal direction', () => {
    const { container } = render(
      <Stack direction="horizontal">
        <span>a</span>
      </Stack>,
    )
    expect(container.firstChild).toHaveClass('ds-stack--horizontal')
  })

  it('sets the gap custom property from the named spacing step', () => {
    const { container } = render(
      <Stack gap="space-3">
        <span>a</span>
      </Stack>,
    )
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--ds-stack-gap')).toBe(
      'var(--space-3)',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/stack.test.tsx`
Expected: FAIL (cannot resolve `./stack`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/stack.tsx`:

```tsx
import type { ReactNode } from 'react'
import './stack.css'

export type StackDirection = 'vertical' | 'horizontal'
export type SpacingStep = 'space-1' | 'space-2' | 'space-3' | 'space-4' | 'space-5'

export interface StackProps {
  direction?: StackDirection
  gap?: SpacingStep
  children: ReactNode
}

export function Stack({ direction = 'vertical', gap = 'space-3', children }: StackProps) {
  return (
    <div
      className={`ds-stack ds-stack--${direction}`}
      style={{ '--ds-stack-gap': `var(--${gap})` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
```

If the `as React.CSSProperties` cast trips the naming or no-explicit-any lint, import the type and cast through a small typed record helper instead; the cast is required because TypeScript's `CSSProperties` does not type arbitrary custom properties.

Create `editor/design-system/stack.css`:

```css
.ds-stack {
  display: flex;
  gap: var(--ds-stack-gap, var(--space-3));
}

.ds-stack--vertical {
  flex-direction: column;
}

.ds-stack--horizontal {
  flex-direction: row;
  align-items: center;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/stack.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/stack.tsx editor/design-system/stack.test.tsx`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/stack.tsx editor/design-system/stack.css editor/design-system/stack.test.tsx
git commit -m "feat: add the Stack layout primitive"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the direction and gap are typed unions (no free strings), the custom-property write is the single piece of inline style, and the CSS has a fallback gap. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: Stack primitive (no changes needed)"
```

---

### Task 6: The empty-state and loading-state primitives

**Files:**

- Create: `editor/design-system/status.tsx`
- Create: `editor/design-system/status.css`
- Test: `editor/design-system/status.test.tsx`

These cover the spec's "empty and loading states" deliverable. `LoadingState` is a polite status surface; `EmptyState` is a titled region with an optional description and an optional action slot (for example a primary `Button`). They give every future surface a consistent, accessible "nothing here / working" treatment.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/status.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EmptyState, LoadingState } from './status'

afterEach(cleanup)

describe('LoadingState', () => {
  it('announces its message through a status role', () => {
    render(<LoadingState message="Loading project..." />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading project...')
  })
})

describe('EmptyState', () => {
  it('renders its title in a labeled region', () => {
    render(<EmptyState title="No projects yet" />)
    expect(screen.getByRole('region', { name: 'No projects yet' })).toBeInTheDocument()
  })

  it('renders an optional description', () => {
    render(<EmptyState title="No projects yet" description="Create one to begin." />)
    expect(screen.getByText('Create one to begin.')).toBeInTheDocument()
  })

  it('renders an optional action slot', () => {
    render(<EmptyState title="No projects yet" action={<button>New project</button>} />)
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/status.test.tsx`
Expected: FAIL (cannot resolve `./status`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/status.tsx`. Use a generated id to wire the region's `aria-labelledby` to its title so the accessible name is the title text:

```tsx
import { useId, type ReactNode } from 'react'
import './status.css'

export interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="ds-status" role="status">
      <p className="ds-status__message">{message}</p>
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const titleId = useId()
  return (
    <section className="ds-status ds-status--empty" aria-labelledby={titleId} role="region">
      <h2 id={titleId} className="ds-status__title">
        {title}
      </h2>
      {description ? <p className="ds-status__message">{description}</p> : null}
      {action ? <div className="ds-status__action">{action}</div> : null}
    </section>
  )
}
```

Create `editor/design-system/status.css`:

```css
.ds-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5);
  color: var(--color-text-muted);
  font-family: var(--font-family-ui);
  font-size: var(--font-size-sm);
  text-align: center;
}

.ds-status__title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.ds-status__message {
  margin: 0;
}

.ds-status__action {
  margin-top: var(--space-2);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/status.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/status.tsx editor/design-system/status.test.tsx`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/status.tsx editor/design-system/status.css editor/design-system/status.test.tsx
git commit -m "feat: add the empty-state and loading-state primitives"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the region's accessible name comes from the title via `aria-labelledby` (no redundant `aria-label`), optional slots render `null` when absent (no empty wrappers), and the CSS is token-only. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: status primitives (no changes needed)"
```

---

### Task 7: The public surface and the Storybook visual check

**Files:**

- Create: `editor/design-system/index.ts`
- Create: `editor/design-system/design-system.stories.tsx`
- Test: the story `play` function (interaction smoke) and manual visual review under both themes.

This task assembles the module's public surface and adds the Storybook coverage that unit tests cannot give: actual rendered color, dark-theme switching, focus-ring appearance, and contrast. The stories file is picked up by the existing `../editor/**/*.stories.@(ts|tsx)` glob in `.storybook/main.ts`, so no Storybook config change is needed.

- [ ] **Step 1: Write the failing test (story interaction)**

Create `editor/design-system/design-system.stories.tsx`. The barrel `./index` does not exist yet, so the import fails to resolve and the story build (and its `play`) fails first:

```tsx
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import {
  Button,
  EmptyState,
  LoadingState,
  Stack,
  ThemeProvider,
  useTheme,
  type ThemeChoice,
} from './index'

const meta: Meta = {
  title: 'Design System/Foundation',
}

export default meta
type Story = StoryObj

const CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

function ThemeSwitcher() {
  const { choice, setChoice } = useTheme()
  return (
    <Stack direction="horizontal" gap="space-2">
      {CHOICES.map((option) => (
        <Button
          key={option}
          variant={option === choice ? 'primary' : 'neutral'}
          aria-pressed={option === choice}
          onClick={() => setChoice(option)}
        >
          {option}
        </Button>
      ))}
    </Stack>
  )
}

function Gallery() {
  const [count, setCount] = useState(0)
  return (
    <Stack gap="space-4">
      <ThemeSwitcher />
      <Stack direction="horizontal" gap="space-2">
        <Button variant="primary" onClick={() => setCount((value) => value + 1)}>
          Primary ({count})
        </Button>
        <Button>Neutral</Button>
        <Button disabled>Disabled</Button>
      </Stack>
      <LoadingState message="Loading project..." />
      <EmptyState
        title="No projects yet"
        description="Create one to begin."
        action={<Button variant="primary">New project</Button>}
      />
    </Stack>
  )
}

export const Foundation: Story = {
  render: () => (
    <ThemeProvider>
      <Gallery />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    // The primitives render and the primary button is reachable by role.
    await expect(screen.getByRole('button', { name: /Primary/ })).toBeInTheDocument()
    await expect(screen.getByRole('status')).toHaveTextContent('Loading project...')
    await expect(screen.getByRole('region', { name: 'No projects yet' })).toBeInTheDocument()
  },
}
```

- [ ] **Step 2: Run the story build to verify it fails**

Run: `pnpm exec eslint editor/design-system/design-system.stories.tsx`
Expected: FAIL with an unresolved import from `./index` (the barrel does not exist).

- [ ] **Step 3: Write the minimal implementation (the barrel)**

Create `editor/design-system/index.ts`:

```ts
export { Button } from './button'
export type { ButtonProps, ButtonVariant } from './button'
export { Stack } from './stack'
export type { StackProps, StackDirection, SpacingStep } from './stack'
export { EmptyState, LoadingState } from './status'
export type { EmptyStateProps, LoadingStateProps } from './status'
export { ThemeProvider, useTheme } from './theme-provider'
export type { ThemeProviderProps } from './theme-provider'
export { resolveTheme } from './theme'
export type { ThemeChoice, ResolvedTheme } from './theme'
export { tokens, tokenList } from './tokens'
export type { Token } from './tokens'
```

- [ ] **Step 4: Verify the barrel resolves and the unit suite is still green**

Run: `pnpm exec eslint editor/design-system/`
Expected: zero problems (the stories import now resolves).

Run: `pnpm exec vitest run editor/design-system/`
Expected: PASS (every primitive and theme test).

- [ ] **Step 5: Run Storybook and review the visual contract by eye**

Run: `pnpm storybook`
Open `Design System / Foundation`. Confirm by eye (these are the checks jsdom cannot make):

- The light theme shows dark text on light surfaces; the primary button is the strong blue with white label text that reads clearly (WCAG AA).
- Clicking `dark` flips the gallery to the dark palette (light text on dark surfaces) and back.
- Tabbing to a button shows a visible focus ring.
- The disabled button is dimmed and not focusable for activation.

The story `play` function also runs under `storybook test` and asserts the primitives are present and correctly roled, which is the automated half of this check.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/index.ts editor/design-system/design-system.stories.tsx
git commit -m "feat: add the design-system public surface and Storybook gallery"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the barrel exports only the intended public names, the story composes the real primitives (no duplicated markup), and the `play` function asserts behavior rather than snapshots. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: design-system surface and stories (no changes needed)"
```

---

### Task 8 (optional): Accessibility and visual-regression pass in a real browser

**Files:**

- Optionally create: `e2e/design-system.spec.ts` (a Playwright spec rendering the Storybook story or a tiny harness page and running `@axe-core/playwright`).

This task is **optional and gated**: include it only if the team wants the design-system gallery covered by the same axe and visual-regression machinery the editor uses. It does not gate the slice. If included, it follows the existing Playwright patterns (`@axe-core/playwright` is already a dependency; the repository memo on regenerating the visual-regression baseline applies). Keep it additive: a new spec file under `e2e/`, no change to `playwright.config.ts` unless a new project entry is genuinely required, in which case flag `playwright.config.ts` as a shared-file touch and coordinate.

- [ ] **Step 1:** Render the gallery (point the spec at the built Storybook story URL or a minimal mounted harness).
- [ ] **Step 2:** Run `AxeBuilder` over it and assert zero violations in both light and dark themes (toggle via the in-story buttons).
- [ ] **Step 3:** Capture a visual-regression screenshot per theme; review the baseline diff before committing it (never commit an unreviewed snapshot baseline).
- [ ] **Step 4:** Commit with `test(e2e): add design-system accessibility and visual checks`.

---

## Coordination and shared-file notes

- **Zero shared-file edits in Tasks 1 through 7.** Everything lands under the new `editor/design-system/` directory. The slice does not touch `editor/index.ts`, `editor/shell/*`, `app/*`, `src/main.tsx`, `index.html`, `eslint.config.js`, `vite.config.ts`, `.storybook/*`, `package.json`, or the lockfile. This is what keeps the slice free of conflicts with the three-dimensional-preview track (which touches `editor/` and `bridge/`) and every other parallel track.
- **The design system is wired into the live app in a later polish slice, not this one.** This slice ships the foundation and proves it in Storybook. Adopting `ThemeProvider` at the app root (`app/app.tsx` or `src/main.tsx`) and migrating existing components (`tools-panel`, `project-controls`, `editor-shell.css`) to the primitives and tokens are deliberately deferred, because those are the shared files other tracks edit and because ADR-0044 calls for continuous per-surface polish rather than a big-bang rewrite. When that wiring slice runs, `app/app.tsx` and `src/main.tsx` are the coordination points to flag.
- **The only optional shared-file touch is in Task 8** (`playwright.config.ts`), and only if a new Playwright project entry is needed; the task tells the implementer to flag and coordinate it.

---

## Decisions I made / open questions

- **Home is `editor/design-system/`, not a new top-level `design-system/` layer.** Forced by the constraint not to touch `eslint.config.js`, `vite.config.ts`, or the tsconfig files: a new top-level layer is unreachable by the boundary rules and uncovered by the coverage and story globs without editing those shared configs. `editor/` already imports `core/`, is a story root, and is a coverage root, so it is the zero-config additive home. If a dedicated top-level layer is wanted later, that is its own small slice that edits the three configs together and is recorded in an ADR.
- **Token resolution stays in `editor/`, not `core/`.** Tokens are a UI and CSS concern and all consumers are React; splitting a tiny pure helper into `core/` would scatter one cohesive module across two layers for no testability gain (the pure `resolveTheme` is already fully unit-tested where it lives).
- **`data-theme` carries the resolved theme on the provider's wrapper.** This is enough for the explicit-choice cascade and for high-contrast and reduced-motion (which key off media queries, not the attribute). The `[data-theme='system']` selector in `tokens.css` is a documented forward hook for a later enhancement that applies the _choice_ on `document.documentElement`; it is verified by the stylesheet-text test, not by a jsdom cascade test (jsdom does not compute custom properties).
- **First primitive is `Button`.** It is the single most-repeated bare element in the existing UI, so it has the highest adoption value and is the clearest first concrete primitive for the test-author to target.
- **Computed-color and contrast claims are made only in the browser (Storybook / optional Playwright), never in a jsdom unit test.** A jsdom test reading a custom property returns the empty string, so any such assertion would be a false test; the plan keeps those checks where a real cascade runs.
- **Open question (non-blocking): persisting the theme choice.** The spec (section 7.7) says user settings, including theme, persist in `LibraryStore`. This slice keeps the choice in React state only and defers persistence to the settings slice that owns `LibraryStore`, because wiring storage here would pull in a shared layer this slice should not touch. Recorded so the later settings slice picks it up.
- **Open question (non-blocking): exact dark-theme color values.** The dark block re-points semantic tokens at existing slate primitives as a sensible default; the precise dark ramp and its AA verification are a visual-design refinement best made against the Storybook gallery in a later polish pass, not pinned blindly here.

```

```
