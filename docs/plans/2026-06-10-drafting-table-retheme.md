# Drafting-table Design-system Retheme Implementation Plan

> **For agentic workers:** this slice is executed with the project's role-separated
> red-green-blue subagents dispatched from the main thread
> (`/test-first` -> `/implement` -> `/clean-code-review` -> `/refactor`), not the
> generic subagent-driven-development handoff. Steps use checkbox (`- [ ]`) syntax
> for tracking. Each cycle is one Conventional Commit sequence: `test:` -> `feat:`
> -> `refactor:` (a possibly-empty refactor marker closes every GREEN).

**Goal:** Re-express the existing design-system tokens in the drafting-table visual
direction (warm vellum canvas, ink-blue chrome, brass/clay/sage accents, a quiet
serif for headings and a monospace for coordinate readouts), with coherent and
WCAG-AA-safe light and dark variants, and a contrast guardrail that enforces the
accessibility commitment in continuous integration.

**Architecture:** The change is confined to `editor/design-system/`. The token
taxonomy (semantic roles referencing a primitive ramp; theming via `data-theme`
custom-property flips) is unchanged; only the primitive ramp, the semantic
mappings, and a small set of additive type/elevation tokens change. A pure WCAG
contrast helper plus a stylesheet-parsing guardrail test prove both themes clear
AA. No editor-shell or non-design-system component is migrated (that is slice 3).

**Tech Stack:** TypeScript, CSS custom properties, React, Vitest (the unit/`check`
gate), Storybook (visual showcase, build-checked).

---

## Context and constraints (read before starting)

- **The token contract** (`docs/specs/2026-06-09-design-system-token-and-theming-contract.md`):
  components reference only semantic `var(--...)` tokens; raw values live only in
  `editor/design-system/tokens.css`; the typed registry
  (`editor/design-system/tokens.ts`) names every token and `tokens.test.ts` pins
  the registry against the stylesheet.
- **The makeover spec** (`docs/specs/2026-06-10-editor-experience-makeover.md`),
  sections "Visual design" and "Risks and open questions": the direction is
  expressed entirely as token values, light and dark, and must clear contrast and
  accessibility thresholds in both variants, with the token system as the guardrail.
- **Why the guardrail is a Vitest test, not Storybook or jsdom getComputedStyle:**
  the contract says assert computed color only in a real browser because custom
  properties do not resolve under jsdom `getComputedStyle`. The CI Storybook job is
  build-only (`.github/workflows/ci.yml` `storybook-build`), so a Storybook play
  function would enforce nothing. This plan instead reads the authored `tokens.css`
  text and resolves the two-tier `var()` chain arithmetically, then applies a pure
  WCAG contrast function. That is deterministic, does not rely on jsdom CSS
  resolution, and runs in the always-on `check` job.
- **No journey-coverage flip.** A retheme adds no user-facing operable capability,
  so `e2e/journey-coverage.json` is untouched and `pnpm integration:audit` stays
  green. (The gate's flip protocol applies to slices that add a journey.)
- **CI visual regression does not break.** `e2e/tests/visual-regression.spec.ts`
  and the scene baseline `test.skip` when no baseline exists for the platform; only
  `*-darwin.png` baselines are committed, and CI runs on linux, so they self-skip.
  Local darwin baselines may drift; regenerating them is optional and local
  (`pnpm e2e --update-snapshots=missing`). `accessibility.spec.ts` runs axe-core on
  the editor in the light theme; the chosen light palette is high-contrast, and the
  Cycle 1 guardrail catches any AA regression first.
- **`button.css` references the `--white` primitive directly** (`color: var(--white)`
  for on-accent text). Keep the `--white` primitive in the ramp so `button.css` is
  not touched; only the _surface_ tokens move off white onto warm vellum.

## File map

- Create `editor/design-system/contrast.ts` - pure WCAG luminance/contrast math over
  sRGB color strings (`#rrggbb`, `#rgb`, `rgb(...)`).
- Create `editor/design-system/contrast.test.ts` - unit tests for the math helper.
- Create `editor/design-system/palette-contrast.test.ts` - the AA guardrail: resolve
  the semantic color tokens from `tokens.css` for light and dark and assert the
  critical pairs clear AA.
- Modify `editor/design-system/tokens.css` - replace the primitive ramp and semantic
  mappings with the drafting-table palette (light, dark, high-contrast); add the
  type and elevation tokens.
- Modify `editor/design-system/tokens.ts` - register the new
  `--font-family-heading`, `--font-family-mono`, `--elevation-raised`, and
  `--elevation-overlay` tokens.
- Modify `editor/design-system/tokens.test.ts` - extend the registry/stylesheet
  pins to cover the retheme and the new tokens.
- Modify `editor/design-system/status.css` - adopt `--font-family-heading` on the
  status title (the natural first use of the heading token).
- Modify `editor/design-system/design-system.stories.tsx` - add a render-only
  `DraftingTable` showcase exercising the palette, serif/mono type, elevation, and
  the material accents in both themes.

## The drafting-table token values (the GREEN targets)

These are the exact values the implementer writes. The Cycle 1 guardrail is the
arbiter of accessibility; these values clear AA with margin (verified during
planning).

Primitive ramp (`tokens.css` `:root`):

```css
/* Warm paper (vellum) ramp */
--vellum-50: #fbf7ef;
--vellum-100: #f4efe4;
--vellum-200: #ece3d2;
--vellum-300: #d9cdb4;

/* Warm ink (umber) text ramp */
--umber-900: #2f2615;
--umber-700: #4a3c26;
--umber-500: #6e5a3c;

/* Ink-blue chrome ramp */
--ink-950: #1a2738;
--ink-900: #23344d;
--ink-800: #2c3e57;
--ink-600: #3a5273;

/* Material accents */
--brass-500: #b08646;
--brass-300: #c8b78f;
--clay-500: #9c5f4a;
--sage-500: #7a8b6f;

/* Neutral retained for on-accent text in button.css */
--white: #ffffff;
```

Semantic light (`:root`):

```css
--color-text: var(--umber-900);
--color-text-muted: var(--umber-500);
--color-surface: var(--vellum-100);
--color-surface-raised: var(--vellum-50);
--color-border: var(--vellum-300);
--color-accent: var(--ink-800);
--color-accent-strong: var(--ink-900);
--color-focus-ring: var(--ink-900);
```

Type, elevation, spacing, radius, motion (`:root`): keep the spacing, radius, font
sizes and motion as they are. Replace/extend the type and add elevation:

```css
--font-family-ui: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--font-family-heading: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
--font-family-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
--elevation-raised: 0 2px 8px rgba(35, 52, 77, 0.1);
--elevation-overlay: 0 12px 32px rgba(35, 52, 77, 0.18);
```

Semantic dark (`[data-theme='dark']` and the `[data-theme='system']` block under
`@media (prefers-color-scheme: dark)` - keep both in sync):

```css
--color-text: var(--vellum-50);
--color-text-muted: var(--brass-300);
--color-surface: var(--ink-950);
--color-surface-raised: var(--ink-900);
--color-border: var(--ink-600);
--color-accent: var(--brass-500);
--color-accent-strong: var(--brass-300);
--color-focus-ring: var(--brass-500);
```

High contrast (`@media (prefers-contrast: more)` on `:root`):

```css
--color-border: var(--umber-700);
--color-focus-ring: var(--ink-900);
```

Reduced motion: unchanged (`--motion-duration: 0ms`).

---

## Cycle 1: the WCAG contrast math helper

**Behavior:** the design system has a pure WCAG luminance/contrast helper, verified
in the unit gate.

> **Re-sequencing note (learned during execution):** the palette AA guardrail
> (`palette-contrast.test.ts`, shown in Step 2 below for reference) was moved into
> Cycle 2. Reason: the _legacy_ dark palette already violates AA - dark
> `--color-accent-strong` (`#1a7fd4`) on the dark surface (`#1e293b`) scores only
> 3.5:1, below the 4.5 threshold - so the guardrail cannot pass until the
> drafting-table dark palette lands. It therefore belongs with the retheme it
> guards, where it provides a real RED -> GREEN. Cycle 1 ships the math helper plus
> its own unit test only.

**Files:**

- Create: `editor/design-system/contrast.ts`
- Test: `editor/design-system/contrast.test.ts`

Dispatch: `/test-first`. Tell the test-author the allowed file is exactly
`contrast.test.ts`, that the helper module `./contrast` does not exist yet (so the
import drives the RED), and to STOP rather than create or edit any implementation
or shared config.

- [ ] **Step 1 (RED): write `contrast.test.ts`** (math helper unit tests)

```ts
import { describe, it, expect } from 'vitest'
import { contrastRatio, parseColor, relativeLuminance } from './contrast'

describe('contrast math', () => {
  it('parses #rrggbb, #rgb, and rgb() into channel values', () => {
    expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('rgb(26, 39, 56)')).toEqual({ r: 26, g: 39, b: 56 })
  })

  it('gives black zero luminance and white unit luminance', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })

  it('scores black on white at the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('scores a color against itself at 1:1 and is order-independent', () => {
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio('#2f2615', '#f4efe4')).toBeCloseTo(contrastRatio('#f4efe4', '#2f2615'), 5)
  })
})
```

- [ ] **Step 2 (reference only - committed in Cycle 2): `palette-contrast.test.ts`** (the guardrail)

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { contrastRatio } from './contrast'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

const AA_NORMAL = 4.5
const AA_UI = 3

function declarationsIn(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim())
    }
  }
  return map
}

function blockBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

function resolveColor(name: string, vars: Map<string, string>): string {
  const value = vars.get(name) ?? name
  const captured = value.match(/var\((--[\w-]+)\)/)?.[1]
  return captured !== undefined ? resolveColor(captured, vars) : value
}

function paletteFor(theme: 'light' | 'dark'): Map<string, string> {
  const root = declarationsIn(blockBody(css, ':root'))
  if (theme === 'light') {
    return root
  }
  const dark = declarationsIn(blockBody(css, "[data-theme='dark']"))
  return new Map([...root, ...dark])
}

describe.each(['light', 'dark'] as const)('drafting-table %s contrast', (theme) => {
  const vars = paletteFor(theme)
  const ratio = (foreground: string, background: string) =>
    contrastRatio(resolveColor(foreground, vars), resolveColor(background, vars))

  it('keeps body text readable on the surface', () => {
    expect(ratio('--color-text', '--color-surface')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps muted text readable on the surface', () => {
    expect(ratio('--color-text-muted', '--color-surface')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps text readable on the raised surface', () => {
    expect(ratio('--color-text', '--color-surface-raised')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the strong accent usable as text on the surface', () => {
    expect(ratio('--color-accent-strong', '--color-surface')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the focus ring visible against the surface', () => {
    expect(ratio('--color-focus-ring', '--color-surface')).toBeGreaterThanOrEqual(AA_UI)
  })
})
```

- [ ] **Step 3 (RED): confirm the test fails.** Run
      `pnpm exec vitest run editor/design-system/contrast.test.ts`.
      Expected: FAIL - `Failed to resolve import "./contrast"` (the module does not
      exist yet). Commit RED (only `contrast.test.ts`):

```bash
git add editor/design-system/contrast.test.ts
git commit -m "test: cover the WCAG contrast math helper"
```

- [ ] **Step 4 (GREEN): write `contrast.ts`.** Dispatch `/implement`. The
      implementer's allowed file is exactly `editor/design-system/contrast.ts`; it sees
      the failing test output but not the test source. The minimal implementation:

```ts
// WCAG relative-luminance and contrast-ratio math over sRGB color strings. Pure
// functions with no DOM, so the token palette can be verified in the unit gate.

interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const CHANNEL_MAX = 255
const HEX_RADIX = 16
const SHORT_HEX_LENGTH = 3
const SRGB_LINEAR_THRESHOLD = 0.03928
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_GAMMA_OFFSET = 0.055
const SRGB_GAMMA_SCALE = 1.055
const SRGB_GAMMA_EXPONENT = 2.4
const LUMINANCE_RED = 0.2126
const LUMINANCE_GREEN = 0.7152
const LUMINANCE_BLUE = 0.0722
const CONTRAST_AMBIENT = 0.05

function parseHex(text: string): Rgb {
  const body = text.slice(1)
  const full = body.length === SHORT_HEX_LENGTH ? body.replace(/./g, (c) => c + c) : body
  const [r = 0, g = 0, b = 0] = (full.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, HEX_RADIX))
  return { r, g, b }
}

function parseRgb(text: string): Rgb {
  const [r = 0, g = 0, b = 0] = text
    .replace(/rgba?\(|\)/g, '')
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  return { r, g, b }
}

export function parseColor(value: string): Rgb {
  const text = value.trim()
  return text.startsWith('#') ? parseHex(text) : parseRgb(text)
}

function channelLuminance(channel: number): number {
  const ratio = channel / CHANNEL_MAX
  if (ratio <= SRGB_LINEAR_THRESHOLD) {
    return ratio / SRGB_LINEAR_DIVISOR
  }
  return ((ratio + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT
}

export function relativeLuminance(color: Rgb): number {
  return (
    LUMINANCE_RED * channelLuminance(color.r) +
    LUMINANCE_GREEN * channelLuminance(color.g) +
    LUMINANCE_BLUE * channelLuminance(color.b)
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(parseColor(foreground))
  const second = relativeLuminance(parseColor(background))
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + CONTRAST_AMBIENT) / (darker + CONTRAST_AMBIENT)
}
```

- [ ] **Step 5 (GREEN): confirm the test passes.** Run the same command as Step 3.
      Expected: PASS (the four math tests). Commit GREEN:

```bash
git add editor/design-system/contrast.ts
git commit -m "feat: add the WCAG contrast math helper"
```

- [ ] **Step 6 (BLUE): review and refactor.** Dispatch `/clean-code-review`
      (scope: `contrast.ts`, `contrast.test.ts`), then `/refactor` (implementation
      only; `contrast.ts`). Land the refactor commit, empty marker if nothing
      actionable:

```bash
git commit --allow-empty -m "refactor: close the contrast-helper cycle"
```

---

## Cycle 2: retheme the primitives and the light and dark semantic mappings

**Behavior:** the design tokens express the drafting-table palette - a warm vellum
canvas instead of white, ink-blue chrome, and a warm dark variant - and the old
slate/blue starter ramp is retired.

**Files:**

- Modify: `editor/design-system/tokens.css`
- Test: `editor/design-system/tokens.test.ts`, plus the guardrail
  `editor/design-system/palette-contrast.test.ts` (authored in Cycle 1, committed
  here - it fails RED on the legacy dark `--color-accent-strong` and goes GREEN with
  the retheme).

Dispatch `/test-first`. Allowed files: `editor/design-system/tokens.test.ts` and
`editor/design-system/palette-contrast.test.ts` only.

- [ ] **Step 1 (RED): extend `tokens.test.ts`** with a `drafting-table palette`
      block (keep the existing `design tokens` describe intact), and stage the
      already-present `palette-contrast.test.ts` guardrail. Add these tests:

```ts
describe('drafting-table palette', () => {
  it('introduces the drafting-table primitive ramp', () => {
    expect(tokensCss).toContain('#f4efe4') // vellum canvas
    expect(tokensCss).toContain('#23344d') // ink chrome
    expect(tokensCss).toContain('#b08646') // brass accent
    expect(tokensCss).toContain('#9c5f4a') // clay accent
    expect(tokensCss).toContain('#7a8b6f') // sage accent
  })

  it('retires the slate and blue starter ramp', () => {
    expect(tokensCss).not.toContain('#1a7fd4') // old blue accent
    expect(tokensCss).not.toContain('#1e293b') // old slate-900
  })

  it('paints the light canvas on warm vellum rather than white', () => {
    expect(tokensCss).toMatch(/--color-surface:\s*var\(--vellum-100\)/)
  })

  it('grounds the dark canvas on deep ink', () => {
    expect(tokensCss).toMatch(/--color-surface:\s*var\(--ink-950\)/)
  })
})
```

- [ ] **Step 2 (RED): confirm failure.** Run
      `pnpm exec vitest run editor/design-system/tokens.test.ts editor/design-system/palette-contrast.test.ts`.
      Expected: FAIL - the migration pins fail (drafting-table hexes absent,
      `#1a7fd4`/`#1e293b` still present) and the guardrail's dark strong-accent
      assertion fails (3.5:1 < 4.5). Commit RED:

```bash
git add editor/design-system/tokens.test.ts editor/design-system/palette-contrast.test.ts
git commit -m "test: pin the accessible drafting-table palette and theme grounds"
```

- [ ] **Step 3 (GREEN): rewrite `tokens.css`.** Dispatch `/implement`. Allowed
      file: `editor/design-system/tokens.css` only. Replace the primitive ramp and the
      semantic light `:root`, the `[data-theme='dark']` block, the
      `@media (prefers-color-scheme: dark) [data-theme='system']` block, and the
      `@media (prefers-contrast: more)` block with the values in
      "The drafting-table token values" above. Keep `--white`, the spacing/radius/font
      -size/motion declarations, and the leading file comment. Do not add the type or
      elevation tokens yet (that is Cycle 3). The implementer must keep the dark and
      system blocks identical, and the retheme must take `palette-contrast.test.ts`
      from RED to GREEN (the new dark `--color-accent-strong`, brass `#c8b78f` on the
      ink `#1a2738` surface, clears AA at about 7.6:1).

- [ ] **Step 4 (GREEN): confirm green.** Run
      `pnpm exec vitest run editor/design-system`. Expected: PASS, including the
      palette guardrail against the new palette and the existing "declares every named
      token" pin. Commit GREEN:

```bash
git add editor/design-system/tokens.css
git commit -m "feat: retheme the design tokens to the drafting-table palette"
```

- [ ] **Step 5 (BLUE): review and refactor.** `/clean-code-review` (scope:
      `tokens.css`, `tokens.test.ts`), then `/refactor`. Land the refactor (empty
      marker if nothing actionable):

```bash
git commit --allow-empty -m "refactor: close the palette-retheme cycle"
```

---

## Cycle 3: the serif heading, monospace, and elevation tokens

**Behavior:** the registry and stylesheet gain the drafting-table typographic and
elevation vocabulary - a quiet serif for headings, a monospace for coordinate
readouts, and two elevation shadows - and the status heading adopts the serif.

**Files:**

- Modify: `editor/design-system/tokens.ts`, `editor/design-system/tokens.css`,
  `editor/design-system/status.css`, `editor/design-system/design-system.stories.tsx`
- Test: `editor/design-system/tokens.test.ts`

Dispatch `/test-first`. Allowed file: `editor/design-system/tokens.test.ts` only.

- [ ] **Step 1 (RED): extend `tokens.test.ts`** with the new-token pins:

```ts
describe('drafting-table type and elevation tokens', () => {
  const names = tokenList.map((entry) => entry.name)

  it('registers the heading, mono, and elevation tokens', () => {
    expect(names).toContain('--font-family-heading')
    expect(names).toContain('--font-family-mono')
    expect(names).toContain('--elevation-raised')
    expect(names).toContain('--elevation-overlay')
  })

  it('gives the heading a serif stack and the readout a monospace stack', () => {
    expect(tokensCss).toMatch(/--font-family-heading:[^;]*serif/)
    expect(tokensCss).toMatch(/--font-family-mono:[^;]*monospace/)
  })
})
```

- [ ] **Step 2 (RED): confirm failure.** Run
      `pnpm exec vitest run editor/design-system/tokens.test.ts`.
      Expected: FAIL (registry lacks the four names; the existing "declares every named
      token in tokens.css" pin also fails once the names register - both close in
      GREEN). Commit RED:

```bash
git add editor/design-system/tokens.test.ts
git commit -m "test: require the heading, mono, and elevation tokens"
```

- [ ] **Step 3 (GREEN): register and declare the tokens, adopt the heading.**
      Dispatch `/implement`. Allowed files: `tokens.ts`, `tokens.css`, `status.css`,
      `design-system.stories.tsx`.

  In `tokens.ts`, add to the `tokens` object (after `fontFamilyUi`):

```ts
fontFamilyHeading: token('--font-family-heading'),
fontFamilyMono: token('--font-family-mono'),
elevationRaised: token('--elevation-raised'),
elevationOverlay: token('--elevation-overlay'),
```

In `tokens.css` `:root`, add the type and elevation declarations from "The
drafting-table token values" (the `--font-family-heading`, `--font-family-mono`,
`--elevation-raised`, `--elevation-overlay` lines).

In `status.css`, give the title the heading font:

```css
.ds-status__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-family-heading);
  font-size: var(--font-size-md);
}
```

In `design-system.stories.tsx`, add a render-only showcase (no play function) and
keep the existing `Foundation` story untouched:

```tsx
function DraftingTableShowcase() {
  return (
    <Stack gap="space-4">
      <ThemeSwitcher />
      <h2 style={{ margin: 0, fontFamily: 'var(--font-family-heading)' }}>Parlor restoration</h2>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
        A warm vellum canvas with ink-blue chrome.
      </p>
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--elevation-raised)',
        }}
      >
        <p style={{ margin: 0, fontFamily: 'var(--font-family-mono)' }}>x 3.20 m y 1.05 m</p>
      </div>
      <Stack direction="horizontal" gap="space-2">
        {['--brass-500', '--clay-500', '--sage-500', '--ink-900'].map((swatch) => (
          <span
            key={swatch}
            aria-hidden="true"
            style={{
              width: 'var(--space-5)',
              height: 'var(--space-5)',
              borderRadius: 'var(--radius-sm)',
              background: `var(${swatch})`,
            }}
          />
        ))}
      </Stack>
    </Stack>
  )
}

export const DraftingTable: Story = {
  render: () => (
    <ThemeProvider>
      <DraftingTableShowcase />
    </ThemeProvider>
  ),
}
```

- [ ] **Step 4 (GREEN): confirm green and the storybook build.** Run
      `pnpm exec vitest run editor/design-system`. Expected: PASS. Then
      `pnpm build-storybook` to confirm the showcase compiles. Commit GREEN:

```bash
git add editor/design-system/tokens.ts editor/design-system/tokens.css \
  editor/design-system/status.css editor/design-system/design-system.stories.tsx
git commit -m "feat: add the drafting-table type and elevation tokens"
```

- [ ] **Step 5 (BLUE): review and refactor.** `/clean-code-review` (scope: the four
      modified files plus the test), then `/refactor`. Land the refactor (empty marker
      if nothing actionable):

```bash
git commit --allow-empty -m "refactor: close the type-and-elevation cycle"
```

---

## Definition of done

- [ ] Full check chain green:
      `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm integration:audit && pnpm build`.
- [ ] `pnpm rgb:audit --range "origin/main..HEAD"` reports a clean test -> feat ->
      refactor sequence for all three cycles.
- [ ] `pnpm integration:audit` is green and `e2e/journey-coverage.json` is unchanged
      (this slice adds no journey capability).
- [ ] Spot-check both themes in Storybook (`pnpm storybook`, the
      `Design System/Foundation` DraftingTable story): light reads as warm vellum with
      ink chrome, dark as deep ink with warm vellum text and brass accents; the focus
      ring and text are clearly legible in both.
- [ ] Open the PR off `main` (push/PR authorized per the resume memory). The branch
      is `feat/drafting-table-retheme`.

## Self-review notes (planner)

- Spec coverage: "expressed entirely as token values (color, type, spacing,
  elevation)" maps to Cycle 2 (color) and Cycle 3 (type, elevation); spacing is
  already tokenized and unchanged. "Light and dark variants" -> Cycle 2 light/dark
  blocks. "Must clear contrast and accessibility thresholds in both variants;
  the token system [is] the guardrail" -> Cycle 1 guardrail across both themes.
  "A quiet serif for headings ... clear sans-serif for controls ... monospace for
  coordinate readouts" -> Cycle 3 `--font-family-heading`/`--font-family-ui`/
  `--font-family-mono`, with the heading adopted on the status title and the mono
  shown in the readout swatch.
- No furniture/shell/command-registry work here; those are later slices.
- Type consistency: the registry keys are `fontFamilyHeading`, `fontFamilyMono`,
  `elevationRaised`, `elevationOverlay`; the guardrail imports `contrastRatio` from
  the core barrel.

## Execution outcome (actual landed sequence)

Four red-green-blue cycles landed, with two deviations driven by clean-code review
during the BLUE phases:

1. **The WCAG contrast math helper.** The BLUE review found the helper duplicated
   `core/color/hex.ts` (`parseHex`) and the sRGB transfer function in
   `core/color/oklab.ts` (`srgbToLinear`), and that pure color math belongs in
   `core/`. The refactor relocated it to `core/color/contrast.ts` (exporting
   `relativeLuminance` and `contrastRatio`, composing the existing core primitives,
   added to the core barrel) and dropped the unused `parseColor`/`rgb()` parsing.
   The guardrail imports `contrastRatio` from `../../core`.
2. **The drafting-table palette retheme (light and dark), with the AA guardrail.**
   The guardrail (`palette-contrast.test.ts`) drove this cycle to green: the legacy
   dark `--color-accent-strong` was 3.5:1 (below AA), and the retheme fixed it.
3. **The on-accent label token (inserted from review).** The Cycle 2 review caught a
   WCAG regression the guardrail had not covered: `button.css` set white text on the
   accent fill, which in dark mode became light brass (1.98:1). A new cycle added a
   `--color-on-accent` semantic token (light `var(--vellum-50)`, dark
   `var(--umber-900)`), repointed the primary button to it, removed the now-unused
   `--white` primitive (resolving the contract violation of a component referencing a
   raw primitive), and extended the guardrail with the on-accent/accent-strong pair.
4. **The serif heading, monospace, and elevation tokens**, with the heading adopted
   on the status title and a render-only `DraftingTable` Storybook showcase.

No ADR was warranted: the retheme is an application of the existing token and theming
contract (no architectural change), and `e2e/journey-coverage.json` is unchanged
(a retheme adds no journey capability).
