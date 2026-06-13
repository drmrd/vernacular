# Draughtsman's Restraint: Token Foundation Implementation Plan

> **For agentic workers:** this slice is executed with the project's role-separated
> red-green-blue subagents dispatched from the main thread
> (`/test-first` -> `/implement` -> `/clean-code-review` -> `/refactor`), not the
> generic subagent-driven-development handoff. Steps use checkbox (`- [ ]`) syntax
> for tracking. Each cycle is one Conventional Commit sequence: `test:` -> `feat:`
> -> `refactor:` (a possibly-empty refactor marker closes every GREEN).

**Goal:** Wire up the Draughtsman's Restraint design language in the token layer: two
new semantic tokens, a brass-600 primitive with corrected hex, light-mode accent
reassignment, web font stacks, Google Fonts loading, and a Storybook showcase that
replaces the DraftingTable placeholder.

**Architecture:** All changes stay inside `editor/design-system/` plus `index.html`.
No shell or canvas component is migrated; each will pick up the new accent color
automatically when components are updated in the follow-on shell chrome plan. The
palette-contrast guardrail (already in CI) extends its coverage to reflect the changed
semantic role of `--color-accent-strong`.

**Tech Stack:** CSS custom properties, TypeScript, Vitest, Storybook, Google Fonts CDN.

---

## Context and constraints (read before starting)

- **Design spec:** `docs/specs/2026-06-13-visual-design-language.md`, section "Token
  changes required." That section lists the exact primitive and semantic changes needed.
- **ADR-0069:** `docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md`
  records the decision rationale for the brass accent shift.
- **A spec correction lands in Cycle 2.** Both the spec and ADR currently say
  `--brass-600: #9a7038`, but this hex gives only 4.15:1 contrast for vellum-50 label
  text on the brass button fill, short of the 4.5:1 WCAG AA threshold for normal text.
  The correct value is `#8b692a` (4.72:1 against vellum-50). The implementer commits
  the corrected hex to the CSS and to the spec/ADR at the same time.
- **The accent-strong role has changed.** The prior retheme plan tested
  `--color-accent-strong` as text on the surface (4.5:1 threshold). It now fills the
  primary button background; the threshold that applies to the fill against the surface
  is the UI-component minimum (3:1). The text-on-button pair (`--color-on-accent` on
  `--color-accent-strong`) stays at 4.5:1. The palette-contrast test is updated to
  reflect this before the CSS change lands.
- **Dark-mode tokens are unchanged.** Cycle 2 only touches the `:root` light-mode
  block. The `[data-theme='dark']` and `[data-theme='system']` blocks stay as-is.
- **`--color-surface-active` and `--color-indicator` inherit to dark mode from `:root`.**
  No dark-mode override is needed: vellum-200 on ink-950 reads as a warm lit chip on a
  dark surface, and brass-500 as the indicator border is already the dark-mode accent.
- **This plan does not cover shell chrome.** Rail restructuring, inspector, top bar, and
  status bar come in a follow-on plan.
- **The Google Fonts link (Cycle 4) is verified manually in the browser.** A Vitest
  assertion on index.html content is the RED pin, but font rendering can only be
  confirmed with DevTools.

## File map

- Modify: `editor/design-system/tokens.css` (Cycles 1, 2, 3)
- Modify: `editor/design-system/tokens.ts` (Cycle 1)
- Modify: `editor/design-system/tokens.test.ts` (Cycles 1, 2, 3, 4)
- Modify: `editor/design-system/palette-contrast.test.ts` (Cycle 2)
- Modify: `editor/design-system/design-system.stories.tsx` (Cycle 5)
- Modify: `index.html` (Cycle 4)
- Modify: `docs/specs/2026-06-13-visual-design-language.md` (Cycle 2, correction)
- Modify: `docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md` (Cycle 2, correction)

---

## Cycle 1: colorSurfaceActive and colorIndicator semantic tokens

**Behavior:** the typed token registry and the CSS stylesheet gain two new semantic
tokens: `--color-surface-active` (the vellum-200 background for active tool chips) and
`--color-indicator` (the brass-500 two-pixel left-border active state marker).

**Files:**

- Test: `editor/design-system/tokens.test.ts`
- Modify: `editor/design-system/tokens.ts`
- Modify: `editor/design-system/tokens.css`

Dispatch `/test-first`. Allowed file: `editor/design-system/tokens.test.ts` only.

- [ ] **Step 1 (RED): add two assertions to `tokens.test.ts`**

In the `'drafting-table type and elevation tokens'` describe block (line 71), add a
new test after the existing two:

```typescript
it('registers the surface-active and indicator semantic tokens', () => {
  const names = tokenList.map((t) => t.name)
  expect(names).toContain('--color-surface-active')
  expect(names).toContain('--color-indicator')
})
```

- [ ] **Step 2 (RED): confirm failure**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: FAIL -- both `toContain` assertions fail because neither token is in the
registry yet.

Commit RED:

```bash
git add editor/design-system/tokens.test.ts
git commit -m "test: require the surface-active and indicator semantic tokens"
```

- [ ] **Step 3 (GREEN): add to `tokens.ts`**

Dispatch `/implement`. Allowed file: `editor/design-system/tokens.ts` only.

In the `tokens` object, add after `colorFocusRing`:

```typescript
colorSurfaceActive: token('--color-surface-active'),
colorIndicator: token('--color-indicator'),
```

- [ ] **Step 4 (GREEN): declare in `tokens.css`**

Dispatch `/implement`. Allowed file: `editor/design-system/tokens.css` only.

In the `:root` semantic block, add after `--color-focus-ring`:

```css
--color-surface-active: var(--vellum-200);
--color-indicator: var(--brass-500);
```

- [ ] **Step 5 (GREEN): confirm green**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: PASS -- the new `contains` test passes, and the existing `'declares every
named token in tokens.css'` pin passes because both names now appear in `tokenList`
and in the stylesheet.

Commit GREEN:

```bash
git add editor/design-system/tokens.ts editor/design-system/tokens.css
git commit -m "feat: add the surface-active and indicator semantic tokens"
```

- [ ] **Step 6 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tokens.ts`, `tokens.css`, `tokens.test.ts`),
then `/refactor` (implementation only: `tokens.ts`, `tokens.css`). Land the refactor
commit, empty marker if nothing actionable:

```bash
git commit --allow-empty -m "refactor: close the semantic-state-tokens cycle"
```

---

## Cycle 2: brass-600 primitive and light-mode accent reassignment

**Behavior:** `--brass-600: #8b692a` joins the primitive ramp (correcting the
placeholder hex in the spec). In the light-mode `:root`, `--color-accent` moves from
`var(--ink-800)` to `var(--brass-500)`, and `--color-accent-strong` moves from
`var(--ink-900)` to `var(--brass-600)`. The spec and ADR are corrected to use the
verified hex. The palette-contrast guardrail is updated to reflect that
`--color-accent-strong` now fills a primary button (UI component, 3:1 threshold) rather
than appearing as text (4.5:1).

**Files:**

- Test: `editor/design-system/tokens.test.ts` (new assertions)
- Modify: `editor/design-system/palette-contrast.test.ts` (rename + threshold)
- Modify: `editor/design-system/tokens.css`
- Modify: `docs/specs/2026-06-13-visual-design-language.md` (hex correction)
- Modify: `docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md` (hex correction)

Dispatch `/test-first`. Allowed files: `editor/design-system/tokens.test.ts` and
`editor/design-system/palette-contrast.test.ts` only.

- [ ] **Step 1 (RED): extend `tokens.test.ts` with brass-600 and accent pins**

In the `'drafting-table palette'` describe block, add two tests:

```typescript
it('includes brass-600 as the primary button-fill primitive', () => {
  expect(tokensCss).toContain('#8b692a')
})

it('assigns the light-mode accent-strong token to the brass-600 primitive', () => {
  expect(tokensCss).toMatch(/--color-accent-strong:\s*var\(--brass-600\)/)
})
```

The first test fails because `#8b692a` is not yet in the CSS. The second fails because
the `:root` block currently maps `--color-accent-strong` to `var(--ink-900)`. (Dark
mode uses `var(--brass-300)`, not brass-600, so no false positive from the dark block.)

- [ ] **Step 2 (MODIFY): update `palette-contrast.test.ts` to reflect the new role**

This change does not create a new failure -- ink-900 on vellum-100 is about 11:1, well
above 3:1 -- but it must land before the CSS change so the test suite stays green
after implementation. Locate this test in the `describe.each` block (line 64):

```typescript
it('keeps the strong accent usable as text on the surface', () => {
  expect(ratio('--color-accent-strong', '--color-surface')).toBeGreaterThanOrEqual(AA_NORMAL)
})
```

Replace it with:

```typescript
it('keeps the primary button fill distinct from the surface', () => {
  expect(ratio('--color-accent-strong', '--color-surface')).toBeGreaterThanOrEqual(AA_UI)
})
```

The existing `'keeps on-accent label text readable on the strong accent fill'` test
(line 68) stays unchanged at `AA_NORMAL` -- button label text still needs 4.5:1.

- [ ] **Step 3 (RED): confirm which tests fail**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts editor/design-system/palette-contrast.test.ts`

Expected: FAIL on the two new `tokens.test.ts` assertions. The palette-contrast tests
all pass (no regression -- the threshold update is only a rename and a lower bound).

Commit RED:

```bash
git add editor/design-system/tokens.test.ts editor/design-system/palette-contrast.test.ts
git commit -m "test: pin brass-600 primitive and reclassify accent-strong as a button fill"
```

- [ ] **Step 4 (GREEN): update `tokens.css`**

Dispatch `/implement`. Allowed file: `editor/design-system/tokens.css` only.

In the material accents section of the primitive ramp (after `--brass-300`), add:

```css
--brass-600: #8b692a;
```

In the light-mode `:root` semantic block, change the two accent lines:

```css
--color-accent: var(--brass-500);
--color-accent-strong: var(--brass-600);
```

Do not touch any dark-mode or media blocks. The full semantic block should now read:

```css
/* Semantic (role) tokens: light theme defaults. */
--color-text: var(--umber-900);
--color-text-muted: var(--umber-500);
--color-surface: var(--vellum-100);
--color-surface-raised: var(--vellum-50);
--color-border: var(--vellum-300);
--color-accent: var(--brass-500);
--color-accent-strong: var(--brass-600);
--color-on-accent: var(--vellum-50);
--color-focus-ring: var(--ink-900);
--color-surface-active: var(--vellum-200);
--color-indicator: var(--brass-500);
```

- [ ] **Step 5 (GREEN): correct the spec and ADR**

In `docs/specs/2026-06-13-visual-design-language.md`, make three substitutions:

1. In the palette block (line 56): change `--brass-600:  #9a7038` to
   `--brass-600:  #8b692a`

2. In the token changes section (line 290): change
   `` `--brass-600: #9a7038` `` to `` `--brass-600: #8b692a` ``

3. On line 306: change
   `brass-600 on vellum-50 clears WCAG AA 4.5:1.` to
   `vellum-50 label text on brass-600 (#8b692a) clears WCAG AA 4.5:1 at 4.72:1.`

In `docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md`
(line 37), change:

`--brass-600: #9a7038` is added for primary button backgrounds (clears WCAG AA 4.5:1
against vellum-50)`

to:

`--brass-600: #8b692a` is added for primary button backgrounds; vellum-50 label text
on this fill clears WCAG AA 4.5:1 at 4.72:1)`

- [ ] **Step 6 (GREEN): confirm green**

Run: `pnpm exec vitest run editor/design-system`

Expected: PASS -- the brass-600 hex test passes, the `--color-accent-strong` pattern
matches, and the palette-contrast guardrail passes for both themes. In light mode:
brass-600 on vellum-100 is 4.41:1 (exceeds 3:1 AA_UI for a button fill against the
surface) and vellum-50 on brass-600 is 4.72:1 (exceeds 4.5:1 AA_NORMAL for button
label text). Dark mode is unchanged; all pairs still clear their prior thresholds.

Commit GREEN:

```bash
git add editor/design-system/tokens.css \
  docs/specs/2026-06-13-visual-design-language.md \
  docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md
git commit -m "feat: add brass-600 and shift light-mode accent tokens to the brass ramp"
```

- [ ] **Step 7 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tokens.css`, `tokens.test.ts`,
`palette-contrast.test.ts`, spec, ADR), then `/refactor` (implementation only:
`tokens.css`). Land the refactor commit:

```bash
git commit --allow-empty -m "refactor: close the brass-accent-reassignment cycle"
```

---

## Cycle 3: EB Garamond and Inter font family stacks

**Behavior:** `--font-family-heading` leads with `'EB Garamond'` (was `'Iowan Old
Style'`) and `--font-family-ui` leads with `'Inter'` (was `system-ui`). The full
fallback stacks are preserved so the UI degrades gracefully before the Google Fonts
request resolves.

**Files:**

- Test: `editor/design-system/tokens.test.ts`
- Modify: `editor/design-system/tokens.css`

Dispatch `/test-first`. Allowed file: `editor/design-system/tokens.test.ts` only.

- [ ] **Step 1 (RED): add font-stack lead assertions to `tokens.test.ts`**

In the `'drafting-table type and elevation tokens'` describe block, add:

```typescript
it('leads the heading stack with EB Garamond for cross-platform serif consistency', () => {
  expect(tokensCss).toMatch(/--font-family-heading:\s*'EB Garamond'/)
})

it('leads the ui stack with Inter for cross-platform sans consistency', () => {
  expect(tokensCss).toMatch(/--font-family-ui:\s*'Inter'/)
})
```

- [ ] **Step 2 (RED): confirm failure**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: FAIL -- heading currently leads with `'Iowan Old Style'` and ui leads with
`system-ui`; neither regex matches.

Commit RED:

```bash
git add editor/design-system/tokens.test.ts
git commit -m "test: require EB Garamond-led heading and Inter-led ui font stacks"
```

- [ ] **Step 3 (GREEN): update `tokens.css` font declarations**

Dispatch `/implement`. Allowed file: `editor/design-system/tokens.css` only.

Replace the two font-family lines in `:root`:

```css
--font-family-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-family-heading:
  'EB Garamond', 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
```

Leave `--font-family-mono` unchanged.

- [ ] **Step 4 (GREEN): confirm green**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: PASS -- both new regex tests match, and the existing `'gives the heading a
serif stack and the readout a monospace stack'` test still passes (the stack ends
with `serif`).

Commit GREEN:

```bash
git add editor/design-system/tokens.css
git commit -m "feat: lead the heading and ui font stacks with EB Garamond and Inter"
```

- [ ] **Step 5 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tokens.css`, `tokens.test.ts`), then
`/refactor`. Land the refactor commit:

```bash
git commit --allow-empty -m "refactor: close the font-family-stack cycle"
```

---

## Cycle 4: Google Fonts loading in index.html

**Behavior:** `index.html` gains a Google Fonts preconnect pair and a stylesheet link
that loads EB Garamond (regular, italic, medium) and Inter (regular, medium, semibold)
with `display=swap`.

**Files:**

- Test: `editor/design-system/tokens.test.ts`
- Modify: `index.html`

Dispatch `/test-first`. Allowed file: `editor/design-system/tokens.test.ts` only.

- [ ] **Step 1 (RED): add HTML font-link assertions to `tokens.test.ts`**

At the top of `tokens.test.ts`, the `readFileSync` and `resolve` imports already
exist for `tokensCss`. Add a parallel read for `index.html` immediately after the
`tokensCss` declaration (keeping it in the same top-level scope):

```typescript
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
```

Then, add a new describe block at the end of the file:

```typescript
describe('Google Fonts loading', () => {
  it('preconnects to fonts.googleapis.com and fonts.gstatic.com', () => {
    expect(indexHtml).toContain('https://fonts.googleapis.com')
    expect(indexHtml).toContain('https://fonts.gstatic.com')
  })

  it('loads EB Garamond and Inter', () => {
    expect(indexHtml).toContain('EB+Garamond')
    expect(indexHtml).toContain('family=Inter')
  })
})
```

- [ ] **Step 2 (RED): confirm failure**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: FAIL -- `index.html` currently has no font link elements.

Commit RED:

```bash
git add editor/design-system/tokens.test.ts
git commit -m "test: require Google Fonts preconnect and EB Garamond/Inter links in index.html"
```

- [ ] **Step 3 (GREEN): update `index.html`**

Dispatch `/implement`. Allowed file: `index.html` only.

Add these three elements inside `<head>` immediately before `</head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap"
/>
```

- [ ] **Step 4 (GREEN): confirm green**

Run: `pnpm exec vitest run editor/design-system/tokens.test.ts`

Expected: PASS.

Commit GREEN:

```bash
git add index.html
git commit -m "feat: load EB Garamond and Inter from Google Fonts"
```

- [ ] **Step 5: verify in the browser**

Run: `pnpm dev` and open the app in a browser. In DevTools (Network tab, filter "fonts"
or "googleapis"):

- Confirm a request goes to `fonts.googleapis.com` and returns CSS with `@font-face` rules.
- Confirm follow-up requests load WOFF2 files for EB Garamond and Inter.

In DevTools Elements panel, select any element that inherits `var(--font-family-heading)`
(the status title, for example) and check its computed font family. It should read
`EB Garamond` once the font has loaded.

- [ ] **Step 6 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `index.html`, `tokens.test.ts`), then
`/refactor`. Land the refactor commit:

```bash
git commit --allow-empty -m "refactor: close the Google-Fonts-loading cycle"
```

---

## Cycle 5: DraughtsmansRestraint Storybook story

**Behavior:** The `DraftingTable` placeholder story is replaced by
`DraughtsmansRestraint`, which shows the complete Draughtsman's Restraint vocabulary:
the primitive swatch ramp (all 14 swatches including brass-600), the semantic token
assignment table (11 rows, light mode), the typography specimen (EB Garamond headings,
Inter body, monospace coordinate), and the component gallery (primary button, active
and inactive tool chips, period tag, era date tag).

**Files:**

- Modify: `editor/design-system/design-system.stories.tsx`

No RED-GREEN split for a purely visual story. Write the complete component, then verify
it renders in Storybook. A play function checks that key specimen text and component
labels are reachable in the DOM.

Dispatch `/implement`. Allowed file:
`editor/design-system/design-system.stories.tsx` only.

- [ ] **Step 1: replace the DraftingTable showcase with DraughtsmansRestraint**

Remove the `DraftingTableShowcase` function (lines 78-119) and the `DraftingTable`
export (lines 121-127). Add in their place:

```tsx
const SWATCH_NAMES = [
  '--vellum-50',
  '--vellum-100',
  '--vellum-200',
  '--vellum-300',
  '--umber-900',
  '--umber-700',
  '--umber-500',
  '--ink-950',
  '--ink-900',
  '--ink-800',
  '--ink-600',
  '--brass-500',
  '--brass-600',
  '--brass-300',
]

const SEMANTIC_ROWS = [
  { token: '--color-text', alias: '--umber-900' },
  { token: '--color-text-muted', alias: '--umber-500' },
  { token: '--color-surface', alias: '--vellum-100' },
  { token: '--color-surface-raised', alias: '--vellum-50' },
  { token: '--color-surface-active', alias: '--vellum-200' },
  { token: '--color-border', alias: '--vellum-300' },
  { token: '--color-accent', alias: '--brass-500' },
  { token: '--color-accent-strong', alias: '--brass-600' },
  { token: '--color-on-accent', alias: '--vellum-50' },
  { token: '--color-focus-ring', alias: '--ink-900' },
  { token: '--color-indicator', alias: '--brass-500' },
]

function DraughtsmansRestraintShowcase() {
  return (
    <Stack gap="space-5">
      <ThemeSwitcher />

      {/* Typography specimen */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Typography
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: 'var(--font-family-heading)',
            fontSize: '1.1rem',
            fontWeight: 500,
            color: 'var(--color-text)',
          }}
        >
          Parlor restoration
        </p>
        <p
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-family-heading)',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: 'var(--color-text-muted)',
          }}
        >
          American Farmhouse, c.1887
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.85rem',
            color: 'var(--color-text)',
          }}
        >
          Property value at 0.85rem Inter 400
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-family-mono)',
            fontSize: '0.8rem',
            color: 'var(--color-text)',
          }}
        >
          x 3.20 m{'  '}y 1.05 m
        </p>
      </section>

      {/* Primitive swatch ramp */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Primitive ramp
        </p>
        {/*
          The design-system showcase reads raw primitive tokens directly to display
          the palette. Product component code references only semantic tokens.
        */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {SWATCH_NAMES.map((name) => (
            <span
              key={name}
              title={name}
              aria-label={name}
              style={{
                display: 'inline-block',
                width: 'var(--space-5)',
                height: 'var(--space-5)',
                borderRadius: 'var(--radius-sm)',
                background: `var(${name})`,
                border: '1px solid var(--color-border)',
              }}
            />
          ))}
        </div>
      </section>

      {/* Semantic token table */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Semantic tokens (light mode)
        </p>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-family-mono)',
          }}
        >
          <tbody>
            {SEMANTIC_ROWS.map(({ token, alias }) => (
              <tr key={token}>
                <td style={{ padding: '2px 8px 2px 0', color: 'var(--color-text)' }}>{token}</td>
                <td style={{ padding: '2px 8px', color: 'var(--color-text-muted)' }}>{alias}</td>
                <td style={{ padding: '2px 0' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '1rem',
                      height: '1rem',
                      background: `var(${token})`,
                      border: '1px solid var(--color-border)',
                      borderRadius: '2px',
                      verticalAlign: 'middle',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Component gallery */}
      <section>
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-family-ui)',
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--color-text-muted)',
          }}
        >
          Component gallery
        </p>
        <Stack gap="space-3">
          {/* Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Button variant="primary">Export</Button>
            <Button>Neutral</Button>
            <Button disabled>Disabled</Button>
          </div>

          {/* Tool chips: active and inactive */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--color-surface-active)',
                borderLeft: '2px solid var(--color-indicator)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-family-ui)',
                color: 'var(--color-text)',
              }}
            >
              Select (active)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-family-ui)',
                color: 'var(--color-text-muted)',
              }}
            >
              Pan (inactive)
            </span>
          </div>

          {/* Period tag and era date tag */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span
              aria-label="period tag: Victorian"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'var(--brass-500)',
                color: 'var(--vellum-50)',
                borderRadius: '999px',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-family-ui)',
                fontWeight: 600,
              }}
            >
              Victorian
            </span>
            <span
              aria-label="era date tag: c.1887"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'var(--vellum-200)',
                color: 'var(--umber-900)',
                border: '1px solid var(--brass-500)',
                borderRadius: '999px',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-family-ui)',
              }}
            >
              c.1887
            </span>
          </div>
        </Stack>
      </section>
    </Stack>
  )
}

export const DraughtsmansRestraint: Story = {
  render: () => (
    <ThemeProvider>
      <DraughtsmansRestraintShowcase />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)
    await expect(screen.getByText('Parlor restoration')).toBeInTheDocument()
    await expect(screen.getByLabelText('period tag: Victorian')).toBeInTheDocument()
    await expect(screen.getByText('Select (active)')).toBeInTheDocument()
  },
}
```

- [ ] **Step 2: verify in Storybook**

Run: `pnpm storybook`. Open `Design System/Foundation/DraughtsmansRestraint`. Verify:

- All 14 swatch cells render with distinct colors. The brass-600 swatch (second from
  right in the brass group) should be visibly darker than brass-500.
- Typography specimen: "Parlor restoration" uses EB Garamond; the period subtitle uses
  EB Garamond italic; the body copy uses Inter; the coordinate uses monospace.
- Semantic table: 11 rows with monospace token names, aliases, and colored swatches.
- Gallery: brass-background Export button; active chip with visible brass left border
  and vellum-200 background; muted-text inactive chip; brass-filled Victorian period
  tag; vellum-bordered era date tag.
- Switch to dark mode with ThemeSwitcher and confirm brass is still the accent in
  the buttons and tool chip border; the swatch ramp remains readable.

Confirm the Storybook build also passes: `pnpm build-storybook`

Commit:

```bash
git add editor/design-system/design-system.stories.tsx
git commit -m "feat: replace DraftingTable story with DraughtsmansRestraint showcase"
```

- [ ] **Step 3 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `design-system.stories.tsx`), then `/refactor`.
Land the refactor commit:

```bash
git commit --allow-empty -m "refactor: close the DraughtsmansRestraint-story cycle"
```

---

## Definition of done

- [ ] Full check chain green:
      `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] `pnpm exec vitest run editor/design-system` passes, including the
      palette-contrast guardrail for both light and dark themes.
- [ ] `pnpm build-storybook` completes without error.
- [ ] DevTools shows EB Garamond and Inter loading from Google Fonts in `pnpm dev`.
- [ ] The `DraughtsmansRestraint` story shows brass buttons, brass chip border, brass
      period tags, and EB Garamond specimen text in both light and dark.
- [ ] Both the spec and ADR use `#8b692a` for `--brass-600` with the corrected
      WCAG contrast note.
- [ ] Branch is `feat/draughtsmans-restraint-token-foundation`. Open a PR for review.

---

## Self-review notes (planner)

**Spec coverage check:**

| Spec requirement                                                      | Cycle |
| --------------------------------------------------------------------- | ----- |
| Add `--brass-600: #8b692a` to the primitive ramp                      | 2     |
| Change `--color-accent` from ink-800 to brass-500 (light mode)        | 2     |
| Change `--color-accent-strong` from ink-900 to brass-600 (light mode) | 2     |
| Add `--color-surface-active: var(--vellum-200)`                       | 1     |
| Add `--color-indicator: var(--brass-500)`                             | 1     |
| `tokens.ts` gains `colorSurfaceActive` and `colorIndicator`           | 1     |
| `palette-contrast.test.ts` updated for the button-fill role           | 2     |
| `--font-family-heading` leads with `'EB Garamond'`                    | 3     |
| `--font-family-ui` leads with `'Inter'`                               | 3     |
| Google Fonts preconnect and link in `index.html`                      | 4     |
| `DraughtsmansRestraint` story replaces `DraftingTable`                | 5     |

**Placeholder scan:** no "TBD," "TODO," "implement later," or vague requirements in
any step. Every step contains the exact code to write and the exact command to run.

**Type consistency:** `tokens.colorSurfaceActive` and `tokens.colorIndicator` are
added in Cycle 1 and referenced by name in the SEMANTIC_ROWS table in Cycle 5.
The showcase uses `var(--color-surface-active)` and `var(--color-indicator)` for the
active chip, both of which exist after Cycle 1. The `DraughtsmansRestraint` export
uses `within` and `expect` from `storybook/test`, the same imports already present at
the top of the file.

**Cycle ordering dependency:** Cycle 5 references `--brass-600`, `--color-surface-active`,
and `--color-indicator`. These all land in Cycles 1-2. Storybook renders them via the
live CSS, so the story must be authored after those cycles complete on the same branch.
The ordering in this plan reflects that dependency.
