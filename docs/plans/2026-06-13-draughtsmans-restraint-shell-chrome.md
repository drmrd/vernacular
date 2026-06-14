# Draughtsman's Restraint: Shell Chrome Implementation Plan

> **For agentic workers:** this slice is executed with the project's role-separated
> red-green-blue subagents dispatched from the main thread
> (`/test-first` -> `/implement` -> `/clean-code-review` -> `/refactor`), not the
> generic subagent-driven-development handoff. Steps use checkbox (`- [ ]`) syntax
> for tracking. Each cycle is one Conventional Commit sequence: `test:` -> `feat:`
> -> `refactor:` (a possibly-empty refactor marker closes every cycle).

**Goal:** Restyle the editor shell chrome to match the Draughtsman's Restraint
visual language: a four-section tool rail with Phosphor icons and a rethemed active
chip, a brass Export primary button with Undo/Redo and view-overlay toggles in the
top bar, a PROPERTIES header with EB Garamond component titles and period attribute
tags in the inspector, and a brass-bordered active floor tab in a new status bar.

**Architecture:** All changes stay within `editor/shell/`, `editor/tools/`,
`editor/plan/` (opening inspector only), `editor/viewport/` (view overlay context),
and `editor/design-system/` (AppFrame status bar slot). The token foundation
(PR #140) is already live on `main`; every color reference in this plan resolves to
an existing semantic token. No canvas, bridge, or core layer is modified.

**Tech Stack:** React, CSS custom properties, Vitest, @testing-library/react,
@phosphor-icons/react (new dependency -- see Cycle 2).

---

## Context and constraints (read before starting)

- **Token foundation is live.** `--color-surface-active`, `--color-indicator`,
  `--color-accent`, `--color-accent-strong`, `--font-family-heading`, and
  `--font-family-ui` are all correct and present in `editor/design-system/tokens.css`.
  Do not touch that file.

- **Design spec:** `docs/specs/2026-06-13-visual-design-language.md`. The "Left
  rail," "Top bar," "Inspector panel," and "Status bar" sections are authoritative.

- **Active chip retheme:** the current `.tools-panel button[aria-pressed='true']`
  uses `background: var(--color-accent-strong)` (brass fill) and
  `color: var(--color-on-accent)` (white text). The spec wants
  `background: var(--color-surface-active)` (warm vellum) and a 2px solid
  `border-left: var(--color-indicator)` (brass) with `color: var(--color-text)`.
  The editor-shell.css test that guards against accent-strong fills paired with
  on-surface text will catch any regression.

- **`@phosphor-icons/react` is not installed.** Cycle 2 adds it. Before running
  the install step, verify the version satisfies the 30-day dependency cooldown:
  `npm info @phosphor-icons/react time | grep '"2\.'`
  and pick the most recent version published more than 30 days before today.

- **Pan tool:** `'pan'` is added to `ToolId` in Cycle 1. The canvas layer
  (`editor/plan/plan-view.tsx`) currently does not distinguish `'pan'` from
  `'select'`; the chip is wired but the canvas behavior is a stub. A note comment
  on the `setTool('pan')` call documents the follow-up.

- **Door and Window chips share `place-opening`.** The `OpeningToolContext`
  fallback (`FALLBACK_VALUE`) lets `ToolsPanel` call `useOpeningTool()` without
  a provider in unit tests that only wrap with `<ActiveToolProvider>`. Cycle 3
  tests that need real placement-type changes must wrap with
  `<OpeningToolProvider>` as well.

- **Grid and Dimensions toggles are stubs.** Cycle 5 introduces `ViewOverlayContext`
  for button state. Wiring the toggles to the canvas grid and dimension annotation
  rendering is deferred; the canvas always renders both for now.

- **Fractional-inch chips are imperial-only.** They render in `OpeningInspector`
  only when `units === 'imperial'`. Metric projects see no chip row.

- **`editor/shell/inspector.test.tsx` does not yet exist.** Cycle 6 creates it.

---

## File map

**Cycle 1** (rail sections and active chip retheme):

- Modify: `editor/tools/active-tool-context.ts`
- Create: `editor/tools/tools-panel.css`
- Modify: `editor/tools/tools-panel.tsx`
- Modify: `editor/tools/tools-panel.test.tsx`
- Modify: `editor/shell/editor-shell.css` (remove migrated tool rules)

**Cycle 2** (Phosphor icons in rail):

- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `editor/tools/tools-panel.tsx`
- Modify: `editor/tools/tools-panel.test.tsx`

**Cycle 3** (Door and Window chips):

- Modify: `editor/tools/tools-panel.tsx`
- Modify: `editor/tools/tools-panel.test.tsx`

**Cycle 4** (top bar: Export + Undo/Redo):

- Modify: `editor/shell/editor-shell.tsx`
- Modify: `editor/shell/editor-shell.test.tsx`
- Modify: `editor/shell/editor-shell.css`

**Cycle 5** (top bar: Grid/Dimensions toggles):

- Create: `editor/viewport/view-overlay-context.ts`
- Modify: `editor/shell/editor-shell.tsx`
- Modify: `editor/shell/editor-shell.test.tsx`

**Cycle 6** (inspector PROPERTIES header):

- Modify: `editor/shell/inspector.tsx`
- Create: `editor/shell/inspector.css`
- Create: `editor/shell/inspector.test.tsx`

**Cycle 7** (inspector EB Garamond component title):

- Modify: `editor/shell/inspector.tsx`
- Modify: `editor/shell/inspector.css`
- Modify: `editor/shell/inspector.test.tsx`

**Cycle 8** (inspector period tags and fractional-inch chips):

- Modify: `editor/shell/inspector.tsx`
- Modify: `editor/shell/inspector.css`
- Modify: `editor/shell/inspector.test.tsx`
- Modify: `editor/plan/opening-inspector.tsx`
- Modify: `editor/plan/opening-inspector.test.tsx`

**Cycle 9** (status bar and floor tab styling):

- Modify: `editor/design-system/app-frame.tsx`
- Modify: `editor/design-system/app-frame.css`
- Modify: `editor/design-system/app-frame.test.tsx`
- Create: `editor/shell/status-bar.tsx`
- Create: `editor/shell/status-bar.css`
- Create: `editor/shell/status-bar.test.tsx`
- Modify: `editor/shell/editor-shell.tsx`
- Modify: `editor/shell/editor-shell.test.tsx`
- Modify: `editor/shell/floor-switcher.tsx`
- Modify: `editor/shell/floor-switcher.test.tsx`

---

## Cycle 1: Tool rail sections and active chip retheme

**Behavior:** `ToolsPanel` renders four labeled sections (SELECT, DRAW, PERIOD,
ANNOTATE) with a Pan chip added to the SELECT section. The active tool chip uses
`--color-surface-active` as its background with a 2px `--color-indicator` left
border instead of the current brass fill.

- [ ] **Step 1 (RED): extend `tools-panel.test.tsx` with section and retheme tests**

Replace the body of the existing `describe('ToolsPanel')` block with the tests below.
Keep the existing `describe('useActiveTool')` block unchanged.

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('renders four labeled rail sections', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByText(/^select$/i)).toBeInTheDocument()
    expect(screen.getByText(/^draw$/i)).toBeInTheDocument()
    expect(screen.getByText(/^period$/i)).toBeInTheDocument()
    expect(screen.getByText(/^annotate$/i)).toBeInTheDocument()
  })

  it('includes a Pan chip in the SELECT section', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('button', { name: /pan/i })).toBeInTheDocument()
  })

  it('defaults to the Select tool active', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /pan/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('marks the active tool chip pressed and all others unpressed', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    await user.click(screen.getByRole('button', { name: /pan/i }))

    expect(screen.getByRole('button', { name: /pan/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('applies the surface-active class to the pressed chip, not the accent-strong class', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const selectChip = screen.getByRole('button', { name: /select/i })

    expect(selectChip).toHaveClass('tools-panel__chip--active')
    expect(selectChip).not.toHaveClass('tools-panel__chip--accent')

    await user.click(screen.getByRole('button', { name: /pan/i }))

    expect(selectChip).not.toHaveClass('tools-panel__chip--active')
  })
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx
```

Expected: FAIL -- the four section labels, the Pan chip, and the
`tools-panel__chip--active` class do not exist yet.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/tools/tools-panel.test.tsx
git commit -m "test: require rail sections, pan chip, and surface-active chip class"
```

- [ ] **Step 4 (GREEN): add `'pan'` to `ToolId` in `active-tool-context.ts`**

```typescript
export type ToolId = 'draw-wall' | 'select' | 'calibrate' | 'place-opening' | 'dimension' | 'pan'
```

Leave `DEFAULT_TOOL` and the context shape unchanged.

- [ ] **Step 5 (GREEN): create `editor/tools/tools-panel.css`**

```css
.tools-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
}

.tools-panel__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.tools-panel__section-label {
  padding: var(--space-2) 0 var(--space-1);
  font-family: var(--font-family-ui);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--color-text-muted);
}

/* Two-column grid for sections with multiple tools. */
.tools-panel__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
}

.tools-panel__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  padding: 4px var(--space-2);
  border: none;
  border-left: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-family-ui);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    background var(--motion-duration),
    color var(--motion-duration);
}

.tools-panel__chip:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.tools-panel__chip--active {
  background: var(--color-surface-active);
  border-left-color: var(--color-indicator);
  color: var(--color-text);
}

.tools-panel__chip--active:hover {
  background: var(--color-surface-active);
}

.tools-panel__chip:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.tools-panel__chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 6 (GREEN): rewrite `editor/tools/tools-panel.tsx`**

Replace the file contents:

```typescript
import { useActiveTool, type ToolId } from './active-tool-context'
import './tools-panel.css'

interface ChipProps {
  toolId?: ToolId
  label: string
  disabled?: boolean
}

function Chip({ toolId, label, disabled }: ChipProps) {
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  return (
    <button
      type="button"
      className={`tools-panel__chip${isActive ? ' tools-panel__chip--active' : ''}`}
      aria-pressed={toolId !== undefined ? isActive : undefined}
      disabled={disabled}
      onClick={toolId !== undefined ? () => setTool(toolId) : undefined}
    >
      {label}
    </button>
  )
}

export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Select</span>
        <Chip toolId="select" label="Select" />
        <Chip toolId="pan" label="Pan" />
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Draw</span>
        <div className="tools-panel__grid">
          <Chip toolId="draw-wall" label="Wall" />
          {/* Door and Window chips land in Cycle 3 */}
          <Chip toolId="place-opening" label="Opening" />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Period</span>
        <div className="tools-panel__grid">
          <Chip label="Fireplace" disabled />
          <Chip label="Chimney" disabled />
          <Chip label="Stairs" disabled />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Annotate</span>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" />
          <Chip label="Label" disabled />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 7 (GREEN): remove migrated rules from `editor/shell/editor-shell.css`**

Delete the `.tools-panel`, `.tools-panel button`, and
`.tools-panel button[aria-pressed='true']` blocks (lines 126-149 in the current
file). The rules are fully replaced by `tools-panel.css`.

- [ ] **Step 8 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx editor/shell/editor-shell.css.test.ts
```

Expected: all tests PASS. The editor-shell.css.test checks for `var(--color-border)`
and `var(--color-text` and will still find both; the tools-panel block that used to
carry those references has been replaced by the new CSS file.

Also verify the full shell test still passes:

```bash
pnpm exec vitest run editor/shell/editor-shell.test.tsx
```

- [ ] **Step 9 (GREEN): commit**

```bash
git add editor/tools/active-tool-context.ts \
  editor/tools/tools-panel.css \
  editor/tools/tools-panel.tsx \
  editor/tools/tools-panel.test.tsx \
  editor/shell/editor-shell.css
git commit -m "feat: restructure tool rail into four sections with surface-active chip retheme"
```

- [ ] **Step 10 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tools-panel.css`, `tools-panel.tsx`,
`tools-panel.test.tsx`, `editor-shell.css`), then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the rail-sections cycle"
```

---

## Cycle 2: Phosphor icons in rail chips

**Behavior:** Every enabled tool chip in the rail renders a Phosphor icon SVG at
16px alongside its text label. The icon uses `aria-hidden="true"` so the button's
accessible name comes from the text, not the SVG.

- [ ] **Step 1 (RED): add icon-presence test to `tools-panel.test.tsx`**

Add this test inside the existing `describe('ToolsPanel')` block:

```typescript
it('renders a Phosphor icon SVG inside the Select chip', () => {
  render(
    <ActiveToolProvider>
      <ToolsPanel />
    </ActiveToolProvider>,
  )

  const selectChip = screen.getByRole('button', { name: /select/i })
  // Phosphor renders an <svg> element inside the button.
  expect(selectChip.querySelector('svg')).not.toBeNull()
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx
```

Expected: FAIL -- no SVG element inside the Select chip.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/tools/tools-panel.test.tsx
git commit -m "test: require Phosphor SVG icon inside the Select rail chip"
```

- [ ] **Step 4 (GREEN): install `@phosphor-icons/react`**

First, check the available versions and their publish dates:

```bash
npm info @phosphor-icons/react time --json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  Object.entries(d)
    .filter(([v]) => /^\d/.test(v))
    .filter(([,t]) => new Date(t) < cutoff)
    .slice(-3)
    .forEach(([v,t]) => console.log(v, t));
"
```

Pick the most recent version shown (it will be >= 30 days old). Then add it to
`package.json` under `dependencies` as an exact version (no `^`), for example:

```json
"@phosphor-icons/react": "2.1.7"
```

Then install:

```bash
pnpm install --frozen-lockfile
```

If `--frozen-lockfile` rejects due to the new package, run without it once, verify
the lockfile update adds only the new package, then commit both:

```bash
pnpm install
```

- [ ] **Step 5 (GREEN): add icons to `tools-panel.tsx`**

Add the imports at the top of the file (the exact icon names used here come from the
design spec's tool-to-Phosphor mapping table):

```typescript
import {
  CursorClick,
  Hand,
  Minus,
  Ruler,
  Tag,
  Flame,
  Buildings,
  Stairs,
} from '@phosphor-icons/react'
```

Update the `Chip` component to accept an optional `icon` prop and render it:

```typescript
import type { Icon } from '@phosphor-icons/react'

interface ChipProps {
  toolId?: ToolId
  label: string
  disabled?: boolean
  icon?: Icon
}

function Chip({ toolId, label, disabled, icon: IconComponent }: ChipProps) {
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  return (
    <button
      type="button"
      className={`tools-panel__chip${isActive ? ' tools-panel__chip--active' : ''}`}
      aria-pressed={toolId !== undefined ? isActive : undefined}
      disabled={disabled}
      onClick={toolId !== undefined ? () => setTool(toolId) : undefined}
    >
      {IconComponent ? <IconComponent size={16} aria-hidden="true" /> : null}
      {label}
    </button>
  )
}
```

Update the section renders to pass icons:

```typescript
export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Select</span>
        <Chip toolId="select" label="Select" icon={CursorClick} />
        <Chip toolId="pan" label="Pan" icon={Hand} />
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Draw</span>
        <div className="tools-panel__grid">
          <Chip toolId="draw-wall" label="Wall" icon={Minus} />
          {/* Door and Window chips land in Cycle 3 */}
          <Chip toolId="place-opening" label="Opening" />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Period</span>
        <div className="tools-panel__grid">
          <Chip label="Fireplace" icon={Flame} disabled />
          <Chip label="Chimney" icon={Buildings} disabled />
          <Chip label="Stairs" icon={Stairs} disabled />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Annotate</span>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" icon={Ruler} />
          <Chip label="Label" icon={Tag} disabled />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 6 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx
```

Expected: PASS. The Select chip now contains an SVG element.

Also run the full suite to confirm no type errors:

```bash
pnpm typecheck
```

- [ ] **Step 7 (GREEN): commit**

```bash
git add package.json pnpm-lock.yaml editor/tools/tools-panel.tsx
git commit -m "feat: add Phosphor icons to rail tool chips"
```

- [ ] **Step 8 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tools-panel.tsx`, `package.json`), then
`/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the Phosphor-icons cycle"
```

---

## Cycle 3: Door and Window chips

**Behavior:** The DRAW section replaces the "Opening" placeholder chip with separate
Door and Window chips. Clicking Door activates `place-opening` and sets the
placement type to the first door type from `builtinElementTypes`. Clicking Window
activates `place-opening` and sets the placement type to the first window type.
Each chip shows as pressed when `place-opening` is active and the placement type
matches its kind: door types for Door, window types for Window.

- [ ] **Step 1 (RED): add Door/Window tests to `tools-panel.test.tsx`**

Add these imports at the top of the test file:

```typescript
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { Door, FrameCorners } from '@phosphor-icons/react'
```

Add the tests inside the `describe('ToolsPanel')` block:

```typescript
it('renders Door and Window chips in the DRAW section (no standalone Opening chip)', () => {
  render(
    <ActiveToolProvider>
      <OpeningToolProvider>
        <ToolsPanel />
      </OpeningToolProvider>
    </ActiveToolProvider>,
  )

  expect(screen.getByRole('button', { name: /door/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /window/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^opening$/i })).toBeNull()
})

it('pressing Door activates place-opening with a door type', async () => {
  const user = userEvent.setup()
  render(
    <ActiveToolProvider>
      <OpeningToolProvider>
        <ToolsPanel />
      </OpeningToolProvider>
    </ActiveToolProvider>,
  )

  await user.click(screen.getByRole('button', { name: /door/i }))

  expect(screen.getByRole('button', { name: /door/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: /window/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

it('pressing Window activates place-opening with a window type', async () => {
  const user = userEvent.setup()
  render(
    <ActiveToolProvider>
      <OpeningToolProvider>
        <ToolsPanel />
      </OpeningToolProvider>
    </ActiveToolProvider>,
  )

  await user.click(screen.getByRole('button', { name: /window/i }))

  expect(screen.getByRole('button', { name: /window/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: /door/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx
```

Expected: FAIL -- Door and Window chips do not exist; the "Opening" chip still does.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/tools/tools-panel.test.tsx
git commit -m "test: require Door and Window chips replacing the Opening placeholder"
```

- [ ] **Step 4 (GREEN): update `tools-panel.tsx` with Door/Window chips**

Add to the imports:

```typescript
import { Door, FrameCorners } from '@phosphor-icons/react'
import { builtinElementTypes, type OpeningFamily } from '../../core'
import { useOpeningTool } from '../plan/opening-tool-context'
```

Add these constants at module scope (before `Chip`):

```typescript
const WINDOW_FAMILIES: ReadonlySet<OpeningFamily> = new Set(['window-fixed', 'window-crank'])

function openingEntries() {
  return Object.values(builtinElementTypes.entries).filter((t) => t.category === 'opening')
}

function isWindowPlacementType(id: string): boolean {
  const type = builtinElementTypes.entries[id]
  const family = type?.opening?.family
  return family !== undefined && WINDOW_FAMILIES.has(family as OpeningFamily)
}

const DEFAULT_DOOR_TYPE: string =
  openingEntries().find(
    (t) => t.opening !== undefined && !WINDOW_FAMILIES.has(t.opening.family as OpeningFamily),
  )?.id ?? 'single-swing-door'

const DEFAULT_WINDOW_TYPE: string =
  openingEntries().find(
    (t) => t.opening !== undefined && WINDOW_FAMILIES.has(t.opening.family as OpeningFamily),
  )?.id ?? 'window-fixed'
```

Add an `OpeningChip` component that handles the Door/Window active-state logic:

```typescript
interface OpeningChipProps {
  kind: 'door' | 'window'
  icon: Icon
  label: string
}

function OpeningChip({ kind, icon: IconComponent, label }: OpeningChipProps) {
  const { tool, setTool } = useActiveTool()
  const { placementType, setPlacementType } = useOpeningTool()
  const defaultType = kind === 'door' ? DEFAULT_DOOR_TYPE : DEFAULT_WINDOW_TYPE
  const isWindow = isWindowPlacementType(placementType)
  const isActive =
    tool === 'place-opening' && (kind === 'window' ? isWindow : !isWindow)

  function handleClick() {
    setTool('place-opening')
    setPlacementType(defaultType)
  }

  return (
    <button
      type="button"
      className={`tools-panel__chip${isActive ? ' tools-panel__chip--active' : ''}`}
      aria-pressed={isActive}
      onClick={handleClick}
    >
      <IconComponent size={16} aria-hidden="true" />
      {label}
    </button>
  )
}
```

Replace the DRAW section content to use `OpeningChip`:

```typescript
<section className="tools-panel__section">
  <span className="tools-panel__section-label">Draw</span>
  <div className="tools-panel__grid">
    <Chip toolId="draw-wall" label="Wall" icon={Minus} />
    <OpeningChip kind="door" icon={Door} label="Door" />
    <OpeningChip kind="window" icon={FrameCorners} label="Window" />
  </div>
</section>
```

- [ ] **Step 5 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/tools/tools-panel.test.tsx
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 6 (GREEN): commit**

```bash
git add editor/tools/tools-panel.tsx editor/tools/tools-panel.test.tsx
git commit -m "feat: replace the Opening placeholder chip with Door and Window chips"
```

- [ ] **Step 7 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `tools-panel.tsx`), then `/refactor`.
Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the door-window-chips cycle"
```

---

## Cycle 4: Export button and Undo/Redo in the top bar

**Behavior:** The top bar gets a brass primary Export button using the
`Button variant="primary"` design-system component. Undo and Redo icon buttons use
`ArrowCounterClockwise` and `ArrowClockwise` from Phosphor and call `session.undo()`
and `session.redo()`. The dev-only wall-count paragraph is removed and save status
moves to a `role="status"` span.

- [ ] **Step 1 (RED): update `editor-shell.test.tsx` with top-bar assertions**

Add these tests to the main `describe('EditorShell')` block:

```typescript
it('renders a primary Export button in the toolbar', () => {
  vi.stubGlobal('navigator', {})

  renderShell({ onExportBundle: vi.fn() })

  const exportBtn = screen.getByRole('button', { name: /^export$/i })
  expect(exportBtn).toHaveClass('ds-button--primary')
})

it('renders Undo and Redo buttons in the toolbar', () => {
  vi.stubGlobal('navigator', {})

  renderShell()

  expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument()
})

it('no longer shows the dev wall-count paragraph in the toolbar', () => {
  vi.stubGlobal('navigator', {})

  renderShell()

  expect(screen.queryByText(/walls:/i)).toBeNull()
})
```

Also remove the `'shows a live wall count and the empty selection state'` test,
which asserts the wall-count paragraph that is being deleted. Update the
`'shows the selected state in the inspector'` test to not rely on the wall count.

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/shell/editor-shell.test.tsx
```

Expected: FAIL -- no primary Export button; no Undo/Redo buttons; the wall-count
paragraph still exists.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/shell/editor-shell.test.tsx
git commit -m "test: require brass Export button, Undo/Redo, and removal of wall count"
```

- [ ] **Step 4 (GREEN): rewrite `ShellHeader` in `editor-shell.tsx`**

Add imports to `editor-shell.tsx`:

```typescript
import { ArrowCounterClockwise, ArrowClockwise } from '@phosphor-icons/react'
import { Button } from '../design-system'
```

Replace the `ShellHeader` function:

```typescript
function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const session = useEditorSession()
  return (
    <div className="editor-shell__toolbar">
      <h1 className="editor-shell__wordmark">Vernacular</h1>
      <nav className="editor-shell__breadcrumb" aria-label="Breadcrumb">
        <span className="editor-shell__breadcrumb-sep">/</span>
        <span className="editor-shell__breadcrumb-active">Floor Plan Editor</span>
      </nav>
      <div className="editor-shell__toolbar-actions">
        <button
          type="button"
          className="editor-shell__icon-btn"
          aria-label="Undo"
          onClick={() => session.undo()}
        >
          <ArrowCounterClockwise size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="editor-shell__icon-btn"
          aria-label="Redo"
          onClick={() => session.redo()}
        >
          <ArrowClockwise size={16} aria-hidden="true" />
        </button>
        {projectControls.onExportBundle ? (
          <Button variant="primary" onClick={projectControls.onExportBundle}>
            Export
          </Button>
        ) : null}
        <UnitToggle
          units={session.getProject().meta.units}
          onChange={(units) => session.dispatch(setUnits(units))}
        />
        <ProjectControls {...projectControls} />
        <CommandBar />
      </div>
      <span role="status" className="editor-shell__save-status">
        {SAVE_STATUS_LABELS[saveStatus]}
      </span>
    </div>
  )
}
```

Remove the `sceneGraphForFloor` and `useSceneGraph` imports from `ShellHeader`'s usage
(keep them if other components in the file still use them).

- [ ] **Step 5 (GREEN): update `editor-shell.css` with top-bar rules**

Add to `editor-shell.css`:

```css
.editor-shell__wordmark {
  margin: 0;
  font-family: var(--font-family-ui);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.editor-shell__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-family-ui);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.editor-shell__breadcrumb-sep {
  color: var(--color-text-muted);
}

.editor-shell__breadcrumb-active {
  color: var(--color-text);
}

.editor-shell__toolbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

.editor-shell__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background var(--motion-duration),
    color var(--motion-duration);
}

.editor-shell__icon-btn:hover {
  background: var(--color-surface-active);
  color: var(--color-text);
}

.editor-shell__icon-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.editor-shell__save-status {
  font-family: var(--font-family-ui);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 6 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/shell/editor-shell.test.tsx editor/shell/editor-shell.css.test.ts
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 7 (GREEN): commit**

```bash
git add editor/shell/editor-shell.tsx \
  editor/shell/editor-shell.test.tsx \
  editor/shell/editor-shell.css
git commit -m "feat: add brass Export button and Undo/Redo to the top bar"
```

- [ ] **Step 8 (BLUE): review and refactor**

Dispatch `/clean-code-review` (scope: `editor-shell.tsx`, `editor-shell.css`,
`editor-shell.test.tsx`), then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the top-bar-export-undo-redo cycle"
```

---

## Cycle 5: Grid and Dimensions toggles in the top bar

**Behavior:** Grid and Dimensions icon-toggle buttons appear in the top bar. State
lives in a new `ViewOverlayContext`. Both buttons are `aria-pressed` toggles. Clicking
Grid flips `showGrid`; clicking Dimensions flips `showDimensions`. The canvas still
renders both overlays regardless of state (wiring deferred).

- [ ] **Step 1 (RED): add toggle tests to `editor-shell.test.tsx`**

```typescript
it('renders Grid and Dimensions toggle buttons in the toolbar', () => {
  vi.stubGlobal('navigator', {})

  renderShell()

  expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /dimensions/i })).toBeInTheDocument()
})

it('toggles the Grid button aria-pressed on click', async () => {
  vi.stubGlobal('navigator', {})
  const user = userEvent.setup()

  renderShell()

  const gridBtn = screen.getByRole('button', { name: /grid/i })
  expect(gridBtn).toHaveAttribute('aria-pressed', 'true')

  await user.click(gridBtn)
  expect(gridBtn).toHaveAttribute('aria-pressed', 'false')
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/shell/editor-shell.test.tsx
```

Expected: FAIL -- Grid and Dimensions buttons do not exist.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/shell/editor-shell.test.tsx
git commit -m "test: require Grid and Dimensions overlay toggles in the top bar"
```

- [ ] **Step 4 (GREEN): create `editor/viewport/view-overlay-context.ts`**

```typescript
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react'

export interface ViewOverlayValue {
  showGrid: boolean
  showDimensions: boolean
  toggleGrid: () => void
  toggleDimensions: () => void
}

const ViewOverlayContext = createContext<ViewOverlayValue | null>(null)

export function useViewOverlay(): ViewOverlayValue {
  const value = useContext(ViewOverlayContext)
  if (value === null) {
    throw new Error('useViewOverlay must be used within a ViewOverlayProvider')
  }
  return value
}

export interface ViewOverlayProviderProps {
  children: ReactNode
}

export function ViewOverlayProvider({ children }: ViewOverlayProviderProps) {
  const [showGrid, setShowGrid] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const value = useMemo<ViewOverlayValue>(
    () => ({
      showGrid,
      showDimensions,
      toggleGrid: () => setShowGrid((prev) => !prev),
      toggleDimensions: () => setShowDimensions((prev) => !prev),
    }),
    [showGrid, showDimensions],
  )
  return createElement(ViewOverlayContext.Provider, { value }, children)
}
```

- [ ] **Step 5 (GREEN): add Grid/Dimensions buttons to `ShellHeader` in `editor-shell.tsx`**

Add the import:

```typescript
import { GridFour, Ruler } from '@phosphor-icons/react'
import { ViewOverlayProvider, useViewOverlay } from '../viewport/view-overlay-context'
```

Inside `ShellHeader`, call `useViewOverlay()` and add the two toggle buttons inside
`.editor-shell__toolbar-actions`, before the Undo/Redo buttons:

```typescript
const { showGrid, showDimensions, toggleGrid, toggleDimensions } = useViewOverlay()

// ... inside the JSX:
<button
  type="button"
  className="editor-shell__icon-btn"
  aria-label="Grid"
  aria-pressed={showGrid}
  onClick={toggleGrid}
  title="Grid (G)"
>
  <GridFour size={16} aria-hidden="true" />
</button>
<button
  type="button"
  className="editor-shell__icon-btn"
  aria-label="Dimensions"
  aria-pressed={showDimensions}
  onClick={toggleDimensions}
  title="Dimensions (D)"
>
  <Ruler size={16} aria-hidden="true" />
</button>
```

Wrap `EditorShell`'s provider tree with `<ViewOverlayProvider>` immediately inside
`<ViewModeProvider>`:

```typescript
<ViewModeProvider>
  <ViewOverlayProvider>
    {/* rest of the tree */}
  </ViewOverlayProvider>
</ViewModeProvider>
```

- [ ] **Step 6 (GREEN): update `editor-shell.css` with active toggle styling**

Add:

```css
.editor-shell__icon-btn[aria-pressed='true'] {
  background: var(--color-surface-active);
  border-color: var(--color-indicator);
  color: var(--color-text);
}
```

- [ ] **Step 7 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/shell/editor-shell.test.tsx editor/shell/editor-shell.css.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8 (GREEN): commit**

```bash
git add editor/viewport/view-overlay-context.ts \
  editor/shell/editor-shell.tsx \
  editor/shell/editor-shell.test.tsx \
  editor/shell/editor-shell.css
git commit -m "feat: add Grid and Dimensions overlay toggles to the top bar"
```

- [ ] **Step 9 (BLUE): review and refactor**

Dispatch `/clean-code-review`, then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the grid-dimensions-toggles cycle"
```

---

## Cycle 6: Inspector PROPERTIES header and selection count

**Behavior:** The inspector always shows a "PROPERTIES" section header. When one or
more entities are selected, a badge showing "N selected" (e.g., "1 selected")
appears beside the heading.

- [ ] **Step 1 (RED): create `editor/shell/inspector.test.tsx`**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  ActiveFloorProvider,
  createEditorSession,
  createSelectionStore,
  createActiveFloorStore,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { Inspector } from './inspector'

afterEach(cleanup)

function renderInspector() {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g' })]
  const session = createEditorSession(project)
  const selection = createSelectionStore()
  const activeFloor = createActiveFloorStore('g')
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveFloorProvider store={activeFloor}>
          <Inspector />
        </ActiveFloorProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  return { selection }
}

describe('Inspector', () => {
  it('renders a PROPERTIES heading', () => {
    renderInspector()
    expect(screen.getByRole('heading', { name: /properties/i })).toBeInTheDocument()
  })

  it('shows no selection count badge when nothing is selected', () => {
    renderInspector()
    expect(screen.queryByText(/selected/i)).toBeNull()
  })

  it('shows a "1 selected" badge when one entity is selected', () => {
    const { selection } = renderInspector()
    act(() => { selection.select('wall:w1') })
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows "2 selected" when two entities are selected', () => {
    const { selection } = renderInspector()
    act(() => {
      selection.select('wall:w1')
      selection.extend('wall:w2')
    })
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx
```

Expected: FAIL -- no PROPERTIES heading exists.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/shell/inspector.test.tsx
git commit -m "test: require PROPERTIES header and selection count in the inspector"
```

- [ ] **Step 4 (GREEN): create `editor/shell/inspector.css`**

```css
.inspector {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
}

.inspector__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.inspector__title {
  margin: 0;
  font-family: var(--font-family-ui);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--color-text-muted);
}

.inspector__count-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--space-2);
  border-radius: 999px;
  background: var(--color-surface-active);
  color: var(--color-text);
  font-family: var(--font-family-ui);
  font-size: 0.68rem;
}
```

- [ ] **Step 5 (GREEN): update `Inspector` in `editor/shell/inspector.tsx`**

Add `import './inspector.css'` at the top.

Wrap the existing `Inspector` function body in a new outer container and prepend
the header:

```typescript
export function Inspector() {
  const session = useEditorSession()
  const graph = useSceneGraph()
  const selectedIds = useSelectionIds()
  const activeFloorId = useActiveFloorId()
  const underlay = useUnderlay()
  const dispatch = (command: unknown): void => {
    session.dispatch(command as Command)
  }
  const floor = activeFloor(session.getProject(), activeFloorId)
  const count = selectedIds.size

  return (
    <div className="inspector">
      <div className="inspector__header">
        <h2 className="inspector__title">Properties</h2>
        {count > 0 ? (
          <span className="inspector__count-badge">{count} selected</span>
        ) : null}
      </div>

      <SelectionInspector
        session={session}
        graph={graph}
        selectedIds={selectedIds}
        dispatch={dispatch}
      />
      <TransformPanel session={session} selectedIds={selectedIds} />
      {floor ? (
        <UnderlayPanel
          floorId={floor.id}
          underlays={floor.underlays}
          dispatch={dispatch}
          onLoadImage={underlay.loadImage}
          onCalibrate={underlay.startCalibration}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx editor/shell/editor-shell.test.tsx
pnpm typecheck
```

Expected: PASS (existing shell tests must still pass).

- [ ] **Step 7 (GREEN): commit**

```bash
git add editor/shell/inspector.tsx \
  editor/shell/inspector.css \
  editor/shell/inspector.test.tsx
git commit -m "feat: add PROPERTIES header and selection count badge to the inspector"
```

- [ ] **Step 8 (BLUE): review and refactor**

Dispatch `/clean-code-review`, then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the inspector-header cycle"
```

---

## Cycle 7: Inspector EB Garamond component title

**Behavior:** When a single entity is selected, the inspector shows the entity type
name (e.g., "Wall", "Room", "Dimension") as an `<h3>` in EB Garamond 500 1rem
umber-900 above the editing controls.

- [ ] **Step 1 (RED): extend `inspector.test.tsx` with component-title tests**

```typescript
it('shows a Wall component title in EB Garamond when a wall is selected', () => {
  const { selection } = renderInspector()
  act(() => {
    selection.select('wall:w1')
  })
  const title = screen.getByRole('heading', { level: 3 })
  expect(title).toHaveTextContent(/wall/i)
  expect(title).toHaveClass('inspector__component-title')
})

it('shows no component title when nothing is selected', () => {
  renderInspector()
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
})

it('shows no component title when two entities are selected', () => {
  const { selection } = renderInspector()
  act(() => {
    selection.select('wall:w1')
    selection.extend('wall:w2')
  })
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
})
```

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx
```

Expected: FAIL -- no `h3` element.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/shell/inspector.test.tsx
git commit -m "test: require EB Garamond component title for single-entity selection"
```

- [ ] **Step 4 (GREEN): add component title CSS to `inspector.css`**

```css
.inspector__component-title {
  margin: 0;
  font-family: var(--font-family-heading);
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text);
}
```

- [ ] **Step 5 (GREEN): add `componentTitle` helper to `inspector.tsx`**

Add a function that derives a display name from the selected entity type:

```typescript
function componentTitleFor(
  selectedIds: ReadonlySet<string>,
  graph: SceneGraph,
  project: Readonly<Project>,
): string | null {
  if (selectedIds.size !== 1) return null
  const [id] = selectedIds
  if (id === undefined) return null
  if (graph.walls.some((w) => w.id === id)) return 'Wall'
  if (graph.rooms.some((r) => r.id === id)) return 'Room'
  if (id.startsWith(DIMENSION_NODE_PREFIX)) return 'Dimension'
  if (id.startsWith(OPENING_NODE_PREFIX)) {
    const rawId = id.slice(OPENING_NODE_PREFIX.length)
    for (const floor of project.floors) {
      const opening = floor.openings.find((o) => o.id === rawId)
      if (opening !== undefined) {
        const elementType = builtinElementTypes.entries[opening.elementTypeId]
        return elementType?.displayName?.['en-US'] ?? 'Opening'
      }
    }
    return 'Opening'
  }
  return null
}
```

Add `import { builtinElementTypes } from '../../core'` if not already present.

Inside `Inspector`, compute the title and render it below the header:

```typescript
const title = componentTitleFor(selectedIds, graph, session.getProject())

// Inside the JSX, after the inspector__header div:
{title !== null ? (
  <h3 className="inspector__component-title">{title}</h3>
) : null}
```

- [ ] **Step 6 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7 (GREEN): commit**

```bash
git add editor/shell/inspector.tsx \
  editor/shell/inspector.css \
  editor/shell/inspector.test.tsx
git commit -m "feat: show EB Garamond component title for single-entity inspector"
```

- [ ] **Step 8 (BLUE): review and refactor**

Dispatch `/clean-code-review`, then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the component-title cycle"
```

---

## Cycle 8: Inspector period attribute tags and fractional-inch chips

**Behavior -- period tags:** When a room with a `periodOverride` is selected, the
inspector shows the period name as a brass-500 pill chip. When a `styleOverride` is
also set, a second chip shows the style name. Tags appear only when the metadata is
present.

**Behavior -- fractional-inch chips:** In `OpeningInspector`, below each dimension
input (Width, Height, Sill height), a row of pill chips for 1/16" through 7/8"
appears when `units === 'imperial'`. Clicking a chip dispatches a resize command
that nudges the value by that fraction of an inch. The last clicked chip is
highlighted with `--color-surface-active`.

### Part A: Period attribute tags

- [ ] **Step 1 (RED): add period-tag tests to `inspector.test.tsx`**

Add this test to the `describe('Inspector')` block:

```typescript
it('shows no period tags when the selected room has no period override', () => {
  const { selection } = renderInspector()
  // The test project has no room overrides.
  renderInspector()
  expect(screen.queryByRole('listitem')).toBeNull()
})
```

Then create a second helper that builds a project where the room has period metadata,
and add a test that finds the tag:

```typescript
function renderInspectorWithPeriodRoom(period: string, style?: string) {
  const { createEmptyProject, createFloor, createWall } = await import('../../core')
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g' })]
  project.roomOverrides = {
    'room-1': { periodOverride: period as PeriodId, styleOverride: style as any },
  }
  // ... render same as renderInspector
}

it('shows a period tag chip when the selected room has a periodOverride', () => {
  // Since adding actual room selection requires a full scene graph with rooms
  // (rooms are derived from walls), this test validates the PeriodTags component
  // in isolation via a direct render.
  const { PeriodTags } = await import('./inspector')
  render(
    <PeriodTags periodName="Victorian" styleName={undefined} />,
  )
  expect(screen.getByText('Victorian')).toBeInTheDocument()
  expect(screen.getByText('Victorian')).toHaveClass('inspector__period-tag')
})
```

Note: `PeriodTags` is exported from `inspector.tsx` for isolation testing. The
integration path (room selected -> tags appear) is covered by the existing
`editor-shell.test.tsx` via the `RoomInspector` tree.

- [ ] **Step 2 (RED): confirm failure**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx
```

Expected: FAIL -- `PeriodTags` is not yet exported.

- [ ] **Step 3 (RED): commit**

```bash
git add editor/shell/inspector.test.tsx
git commit -m "test: require period tag chips in the inspector for rooms with period metadata"
```

- [ ] **Step 4 (GREEN): add period tag CSS to `inspector.css`**

```css
.inspector__period-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}

.inspector__period-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-family: var(--font-family-ui);
  font-size: 0.65rem;
  font-weight: 600;
}
```

- [ ] **Step 5 (GREEN): add `PeriodTags` to `inspector.tsx` and export it**

```typescript
interface PeriodTagsProps {
  periodName: string | undefined
  styleName: string | undefined
}

export function PeriodTags({ periodName, styleName }: PeriodTagsProps) {
  if (periodName === undefined && styleName === undefined) return null
  return (
    <ul className="inspector__period-tags">
      {periodName !== undefined ? (
        <li className="inspector__period-tag">{periodName}</li>
      ) : null}
      {styleName !== undefined ? (
        <li className="inspector__period-tag">{styleName}</li>
      ) : null}
    </ul>
  )
}
```

Wire `PeriodTags` into `RoomInspector`. Import the resolved period display name from
`builtinPeriods`:

```typescript
import { builtinPeriods } from '../../core'

function RoomInspector({ roomNode, project, dispatch }: RoomInspectorProps) {
  const roomKey = roomNode.id.slice(ROOM_ID_PREFIX.length)
  const override = project.roomOverrides?.[roomKey]
  const preferences = PREFERENCES_BY_UNITS[project.meta.units]
  const height = resolveCeilingHeight(roomNode)
  const periodEntry = override?.periodOverride
    ? builtinPeriods.entries[override.periodOverride]
    : undefined
  const periodName = periodEntry?.displayName?.['en-US']
  const styleName = override?.styleOverride
    ? String(override.styleOverride)
    : undefined

  return (
    <>
      <PeriodTags periodName={periodName} styleName={styleName} />
      {/* existing room editors below */}
      <RoomNameEditor ... />
      ...
    </>
  )
}
```

- [ ] **Step 6 (GREEN): confirm green (Part A)**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx
```

### Part B: Fractional-inch chips in `OpeningInspector`

- [ ] **Step 7 (RED): add fraction-chip tests to `opening-inspector.test.tsx`**

The existing tests are in `editor/plan/opening-inspector.test.tsx`. Add:

```typescript
it('shows fractional-inch chip row for each dimension field in imperial mode', () => {
  // Render an imperial opening inspector; pick any existing test project pattern.
  // Expect 8 chips per dimension field (Width, Height, Sill height) = 24 total,
  // but assert only that the chip row for Width exists.
  renderOpeningInspector({ units: 'imperial' })

  const rows = screen.getAllByRole('list', { name: /fraction chips for/i })
  expect(rows.length).toBeGreaterThanOrEqual(3)
})

it('does not show fraction chips in metric mode', () => {
  renderOpeningInspector({ units: 'metric' })

  expect(screen.queryByRole('list', { name: /fraction chips for/i })).toBeNull()
})

it('clicking a fraction chip dispatches a resize command', async () => {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  renderOpeningInspector({ units: 'imperial', dispatch })

  const chip = screen.getAllByRole('button', { name: /1\/4/i })[0]
  await user.click(chip)

  expect(dispatch).toHaveBeenCalledTimes(1)
})
```

The `renderOpeningInspector` helper follows the same pattern as the existing test
setup in that file; extend it to accept `units` and `dispatch` overrides.

- [ ] **Step 8 (RED): confirm failure**

```bash
pnpm exec vitest run editor/plan/opening-inspector.test.tsx
```

Expected: FAIL -- no fraction chip lists.

- [ ] **Step 9 (RED): commit**

```bash
git add editor/shell/inspector.test.tsx editor/plan/opening-inspector.test.tsx
git commit -m "test: require period tags in inspector and fractional-inch chips in opening inspector"
```

- [ ] **Step 10 (GREEN): add fraction chips to `opening-inspector.tsx`**

Add this constant and component at the top of the file:

```typescript
const INCH_IN_MM = 25.4

const FRACTION_CHIPS = [
  { label: '1⁄ 16​"', deltaMm: INCH_IN_MM / 16 },
  { label: '1⁄8"', deltaMm: INCH_IN_MM / 8 },
  { label: '1⁄4"', deltaMm: INCH_IN_MM / 4 },
  { label: '3⁄8"', deltaMm: (3 * INCH_IN_MM) / 8 },
  { label: '1⁄2"', deltaMm: INCH_IN_MM / 2 },
  { label: '5⁄8"', deltaMm: (5 * INCH_IN_MM) / 8 },
  { label: '3⁄4"', deltaMm: (3 * INCH_IN_MM) / 4 },
  { label: '7⁄8"', deltaMm: (7 * INCH_IN_MM) / 8 },
] as const
```

Note: use the Unicode fraction-slash `⁄` and Unicode thin-space `​` for
correct fraction rendering, or use simple ASCII `1/4"` labels -- both work in the
chip text.

A simpler label form using plain ASCII (choose one style and be consistent):

```typescript
const FRACTION_CHIPS = [
  { label: '1/16"', deltaMm: INCH_IN_MM / 16 },
  { label: '1/8"', deltaMm: INCH_IN_MM / 8 },
  { label: '1/4"', deltaMm: INCH_IN_MM / 4 },
  { label: '3/8"', deltaMm: (3 * INCH_IN_MM) / 8 },
  { label: '1/2"', deltaMm: INCH_IN_MM / 2 },
  { label: '5/8"', deltaMm: (5 * INCH_IN_MM) / 8 },
  { label: '3/4"', deltaMm: (3 * INCH_IN_MM) / 4 },
  { label: '7/8"', deltaMm: (7 * INCH_IN_MM) / 8 },
] as const
```

Add the `FractionChips` component:

```typescript
interface FractionChipsProps {
  dimensionLabel: string
  currentMm: number
  onNudge: (deltaMm: number) => void
}

function FractionChips({ dimensionLabel, currentMm, onNudge }: FractionChipsProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  return (
    <ul
      className="opening-inspector__fraction-chips"
      aria-label={`Fraction chips for ${dimensionLabel}`}
    >
      {FRACTION_CHIPS.map(({ label, deltaMm }) => (
        <li key={label}>
          <button
            type="button"
            className={`opening-inspector__fraction-chip${
              activeLabel === label ? ' opening-inspector__fraction-chip--active' : ''
            }`}
            onClick={() => {
              setActiveLabel(label)
              onNudge(deltaMm)
            }}
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
  )
}
```

Update `DimensionFields` to render `FractionChips` below each `LengthField` when
`units === 'imperial'`:

```typescript
interface DimensionFieldsProps {
  opening: Opening
  preferences: UnitPreferences
  assumeUnit: AssumedUnit
  units: UnitSystem
  onResize: (dimensions: OpeningDimensions) => void
}

function DimensionFields({
  opening,
  preferences,
  assumeUnit,
  units,
  onResize,
}: DimensionFieldsProps): ReactElement {
  const current = openingDimensions(opening)
  return (
    <>
      {DIMENSION_DESCRIPTORS.map(({ key, label }) => (
        <div key={key}>
          <LengthField
            inputId={`opening-${kebabCase(key)}-${opening.id}`}
            label={label}
            valueMm={current[key]}
            preferences={preferences}
            assumeUnit={assumeUnit}
            onCommitMm={(value) => onResize({ ...current, [key]: value })}
          />
          {units === 'imperial' ? (
            <FractionChips
              dimensionLabel={label}
              currentMm={current[key]}
              onNudge={(delta) => onResize({ ...current, [key]: current[key] + delta })}
            />
          ) : null}
        </div>
      ))}
    </>
  )
}
```

Pass `units` down from `OpeningInspector` to `DimensionFields`:

```typescript
<DimensionFields
  opening={opening}
  preferences={preferences}
  assumeUnit={assumeUnit}
  units={units}
  onResize={(dimensions) => dispatch(resizeOpening(floorId, opening.id, dimensions))}
/>
```

Add the CSS for fraction chips. Create or append to an
`editor/plan/opening-inspector.css` file:

```css
.opening-inspector__fraction-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  list-style: none;
  margin: var(--space-1) 0 0;
  padding: 0;
}

.opening-inspector__fraction-chip {
  padding: 1px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-family-ui);
  font-size: 0.7rem;
  cursor: pointer;
  transition:
    background var(--motion-duration),
    color var(--motion-duration);
}

.opening-inspector__fraction-chip:hover {
  background: var(--color-surface-active);
  color: var(--color-text);
}

.opening-inspector__fraction-chip--active {
  background: var(--color-surface-active);
  color: var(--color-text);
  border-color: var(--color-indicator);
}

.opening-inspector__fraction-chip:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}
```

If `opening-inspector.css` does not exist yet, create it and add
`import './opening-inspector.css'` to `opening-inspector.tsx`.

- [ ] **Step 11 (GREEN): confirm green**

```bash
pnpm exec vitest run editor/shell/inspector.test.tsx editor/plan/opening-inspector.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 12 (GREEN): commit**

```bash
git add editor/shell/inspector.tsx \
  editor/shell/inspector.css \
  editor/shell/inspector.test.tsx \
  editor/plan/opening-inspector.tsx \
  editor/plan/opening-inspector.test.tsx
git commit -m "feat: add period tags to inspector and fractional-inch chips to opening inspector"
```

- [ ] **Step 13 (BLUE): review and refactor**

Dispatch `/clean-code-review`, then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the inspector-period-tags-and-fraction-chips cycle"
```

---

## Cycle 9: Status bar and floor tab styling

**Behavior:** `AppFrame` gains an optional `statusBar` slot that spans the full
width below the main content row. A new `StatusBar` component renders the
`FloorSwitcher` as horizontal tabs; the active tab has umber-900 text and a 2px
brass bottom border. The `FloorSwitcher` moves from the tool rail `PanelSlot` in
`editor-shell.tsx` to the new status bar. Additional status bar fields (tool name,
cursor coordinates, snap status) are laid out as empty spans with class names for
future wiring.

- [ ] **Step 1 (RED): extend `app-frame.test.tsx` to assert the status bar slot**

```typescript
it('renders the optional statusBar slot spanning the full width', () => {
  render(
    <AppFrame
      header={<div>header</div>}
      rail={<div>rail</div>}
      railLabel="Rail"
      main={<div>main</div>}
      mainLabel="Main"
      inspector={<div>inspector</div>}
      inspectorLabel="Inspector"
      statusBar={<div data-testid="status">status content</div>}
    />,
  )
  expect(screen.getByTestId('status')).toBeInTheDocument()
})
```

- [ ] **Step 2 (RED): extend `floor-switcher.test.tsx` with tab styling assertions**

```typescript
it('applies the active-tab class to the active floor button', () => {
  render(
    <FloorSwitcher
      floors={floors}
      activeFloorId="f1"
      onSelectFloor={vi.fn()}
      onAddFloor={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: /Ground/ })).toHaveClass(
    'floor-switcher__tab--active',
  )
  expect(screen.getByRole('button', { name: /Upper/ })).not.toHaveClass(
    'floor-switcher__tab--active',
  )
})
```

- [ ] **Step 3 (RED): create `editor/shell/status-bar.test.tsx`**

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBar } from './status-bar'

afterEach(cleanup)

const floors = [
  { id: 'f1', name: 'Ground' },
  { id: 'f2', name: 'Upper' },
]

describe('StatusBar', () => {
  it('renders a floor selector navigation', () => {
    render(
      <StatusBar
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={vi.fn()}
        onAddFloor={vi.fn()}
      />,
    )
    expect(screen.getByRole('navigation', { name: /floors/i })).toBeInTheDocument()
  })

  it('calls onSelectFloor when an inactive tab is clicked', async () => {
    const user = userEvent.setup()
    const onSelectFloor = vi.fn()
    render(
      <StatusBar
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={onSelectFloor}
        onAddFloor={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Upper/ }))
    expect(onSelectFloor).toHaveBeenCalledWith('f2')
  })
})
```

- [ ] **Step 4 (RED): confirm failures**

```bash
pnpm exec vitest run \
  editor/design-system/app-frame.test.tsx \
  editor/shell/floor-switcher.test.tsx \
  editor/shell/status-bar.test.tsx
```

Expected: all FAIL -- `statusBar` prop not accepted; `floor-switcher__tab--active`
class not applied; `StatusBar` does not exist.

- [ ] **Step 5 (RED): commit**

```bash
git add editor/design-system/app-frame.test.tsx \
  editor/shell/floor-switcher.test.tsx \
  editor/shell/status-bar.test.tsx
git commit -m "test: require AppFrame statusBar slot, active floor tab class, and StatusBar component"
```

- [ ] **Step 6 (GREEN): add `statusBar` prop to `AppFrame`**

In `app-frame.tsx`, extend `AppFrameProps`:

```typescript
export interface AppFrameProps {
  header: ReactNode
  rail: ReactNode
  railLabel: string
  main: ReactNode
  mainLabel: string
  inspector: ReactNode
  inspectorLabel: string
  statusBar?: ReactNode
}
```

In the `AppFrame` function, add the status bar beneath the main grid:

```typescript
export function AppFrame({
  header,
  rail,
  railLabel,
  main,
  mainLabel,
  inspector,
  inspectorLabel,
  statusBar,
}: AppFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const breakpoint = useBreakpoint(frameRef)
  return (
    <div ref={frameRef} className="ds-app-frame" data-breakpoint={breakpoint}>
      <header className="ds-app-frame__header" role="banner">
        {header}
      </header>
      <CollapsiblePane area="rail" label={railLabel}>
        {rail}
      </CollapsiblePane>
      <main className="ds-app-frame__main" aria-label={mainLabel}>
        {main}
      </main>
      <CollapsiblePane area="inspector" label={inspectorLabel}>
        {inspector}
      </CollapsiblePane>
      {statusBar ? (
        <footer className="ds-app-frame__status">{statusBar}</footer>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 7 (GREEN): update `app-frame.css` to add the status bar grid area**

Replace the grid-template-areas rules:

```css
.ds-app-frame {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'header header header'
    'rail main inspector'
    'status status status';
  /* rest of the existing rules unchanged */
}

.ds-app-frame__status {
  grid-area: status;
  border-top: 1px solid var(--color-border);
  padding: var(--space-1) var(--space-3);
}
```

Update the medium and narrow breakpoint blocks to include the `status` area:

```css
.ds-app-frame[data-breakpoint='medium'] {
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'header header'
    'main inspector'
    'status status';
}

.ds-app-frame[data-breakpoint='narrow'] {
  grid-template-columns: 1fr;
  grid-template-areas:
    'header'
    'main'
    'inspector'
    'status';
}
```

- [ ] **Step 8 (GREEN): update `FloorSwitcher` with tab classes**

In `floor-switcher.tsx`, add the active class to each floor button:

```typescript
export function FloorSwitcher({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
}: FloorSwitcherProps): ReactElement {
  return (
    <nav aria-label="Floors">
      <ul className="floor-switcher__tabs">
        {floors.map((floor) => (
          <li key={floor.id}>
            <button
              type="button"
              className={`floor-switcher__tab${
                floor.id === activeFloorId ? ' floor-switcher__tab--active' : ''
              }`}
              aria-pressed={floor.id === activeFloorId}
              onClick={() => onSelectFloor(floor.id)}
            >
              {floor.name}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAddFloor}>
        Add floor
      </button>
    </nav>
  )
}
```

Create `editor/shell/floor-switcher.css`:

```css
.floor-switcher__tabs {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 0;
}

.floor-switcher__tab {
  padding: 4px var(--space-3);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-family-ui);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    color var(--motion-duration),
    border-color var(--motion-duration);
}

.floor-switcher__tab:hover {
  color: var(--color-text);
}

.floor-switcher__tab--active {
  color: var(--color-text);
  border-bottom-color: var(--color-indicator);
}

.floor-switcher__tab:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}
```

Add `import './floor-switcher.css'` to `floor-switcher.tsx`.

- [ ] **Step 9 (GREEN): create `editor/shell/status-bar.tsx`**

```typescript
import type { ReactElement } from 'react'
import { FloorSwitcher, type FloorSummary } from './floor-switcher'
import './status-bar.css'

export interface StatusBarProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
}

export function StatusBar({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
}: StatusBarProps): ReactElement {
  return (
    <div className="status-bar">
      <FloorSwitcher
        floors={floors}
        activeFloorId={activeFloorId}
        onSelectFloor={onSelectFloor}
        onAddFloor={onAddFloor}
      />
      <span className="status-bar__tool" />
      <span className="status-bar__coords" />
      <span className="status-bar__snap" />
      <span className="status-bar__zoom" />
    </div>
  )
}
```

Create `editor/shell/status-bar.css`:

```css
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.status-bar__tool,
.status-bar__coords,
.status-bar__snap,
.status-bar__zoom {
  font-family: var(--font-family-ui);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 10 (GREEN): wire StatusBar into EditorShell**

In `editor-shell.tsx`, import `StatusBar`:

```typescript
import { StatusBar } from './status-bar'
```

Update `ToolRail` to remove the `FloorSwitcher` panel slot (the switcher now lives
in the status bar):

```typescript
function ToolRail() {
  return (
    <>
      <ToolsNav />
      <PanelSlot slotId={SNAP_PANEL_SLOT} label="Snapping">
        <SnapPanel />
      </PanelSlot>
    </>
  )
}
```

Remove `FLOOR_SWITCHER_SLOT` from the import list if no longer used.

Add a `ShellStatusBar` component:

```typescript
function ShellStatusBar() {
  const session = useEditorSession()
  const activeFloorId = useActiveFloorId()
  const setActiveFloorId = useSetActiveFloorId()
  useSceneGraph()
  return (
    <StatusBar
      floors={floorSummaries(session.getProject())}
      activeFloorId={activeFloorId}
      onSelectFloor={setActiveFloorId}
      onAddFloor={() => session.dispatch(addFloor('New Floor'))}
    />
  )
}
```

Pass it to `AppFrame`:

```typescript
<AppFrame
  header={<ShellHeader saveStatus={saveStatus} projectControls={projectControls} />}
  railLabel="Tool rail"
  rail={<ToolRail />}
  mainLabel="Viewport"
  main={<ViewportArea />}
  inspectorLabel="Inspector"
  inspector={<InspectorPanels />}
  statusBar={<ShellStatusBar />}
/>
```

- [ ] **Step 11 (GREEN): update `editor-shell.test.tsx` for floor switcher removal from rail**

The existing test `'lays out the shell in the application frame with empty sibling panel slots'`
checks for `FLOOR_SWITCHER_SLOT`. Remove that slot id from the assertion since the
floor switcher has moved to the status bar. Update the test to assert that the status
bar navigation is now present instead:

```typescript
it('renders the floor selector in the status bar, not the tool rail', () => {
  vi.stubGlobal('navigator', {})

  renderShell()

  // FloorSwitcher is now in the status bar region (footer), not a rail PanelSlot.
  const footer = document.querySelector('.ds-app-frame__status')
  expect(footer).not.toBeNull()
  expect(
    within(footer as HTMLElement).getByRole('navigation', { name: /floors/i }),
  ).toBeInTheDocument()
})
```

- [ ] **Step 12 (GREEN): confirm green**

```bash
pnpm exec vitest run \
  editor/design-system/app-frame.test.tsx \
  editor/shell/floor-switcher.test.tsx \
  editor/shell/status-bar.test.tsx \
  editor/shell/editor-shell.test.tsx
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 13 (GREEN): commit**

```bash
git add editor/design-system/app-frame.tsx \
  editor/design-system/app-frame.css \
  editor/design-system/app-frame.test.tsx \
  editor/shell/status-bar.tsx \
  editor/shell/status-bar.css \
  editor/shell/status-bar.test.tsx \
  editor/shell/floor-switcher.tsx \
  editor/shell/floor-switcher.css \
  editor/shell/floor-switcher.test.tsx \
  editor/shell/editor-shell.tsx \
  editor/shell/editor-shell.test.tsx
git commit -m "feat: add status bar with brass-bordered active floor tab to the AppFrame"
```

- [ ] **Step 14 (BLUE): review and refactor**

Dispatch `/clean-code-review`, then `/refactor`. Empty-marker commit:

```bash
git commit --allow-empty -m "refactor: close the status-bar cycle"
```

---

## Definition of done

- [ ] Full check chain green:
      `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
- [ ] Rail renders four labeled sections with Phosphor icons; active chip shows
      vellum-200 background and 2px brass left border (not brass fill).
- [ ] Door and Window chips replace the Opening placeholder; clicking each one
      activates `place-opening` with the correct type.
- [ ] Top bar has a brass primary Export button and Undo/Redo icon buttons.
- [ ] Grid and Dimensions toggles show correct `aria-pressed` state.
- [ ] Inspector shows "PROPERTIES" heading, selection count badge, EB Garamond
      component title for single selections, and period tag chips for rooms with
      period metadata.
- [ ] Opening inspector shows fractional-inch chip rows in imperial mode, no chips
      in metric mode, and dispatches a resize command on chip click.
- [ ] Status bar shows floor tabs with brass bottom border on the active tab;
      FloorSwitcher no longer appears in the tool rail.
- [ ] `editor/shell/editor-shell.css` contains no raw hex values outside the
      documented `--shell-warning-*` properties.
- [ ] Branch is `feat/draughtsmans-restraint-shell-chrome`. PR targets `main`.
      Issue #133 is referenced in the PR description.

---

## Self-review notes

**Spec coverage check:**

| Spec requirement                                                           | Cycle |
| -------------------------------------------------------------------------- | ----- |
| Rail: 4 sections with Inter section labels                                 | 1     |
| Rail: 2-column grid for Draw, Period, Annotate                             | 1     |
| Rail: active chip = surface-active bg + 2px indicator left border          | 1     |
| Rail: Pan chip in SELECT section                                           | 1     |
| Rail: Phosphor Regular icons at 16px on all chips                          | 2     |
| Rail: Door (Door icon) and Window (FrameCorners icon) in DRAW              | 3     |
| Rail: Period section with Fireplace (Flame), Chimney (Buildings), Stairs   | 2     |
| Top bar: Export as brass primary Button                                    | 4     |
| Top bar: Undo (ArrowCounterClockwise) and Redo (ArrowClockwise) buttons    | 4     |
| Top bar: Grid and Dimensions view toggles with aria-pressed                | 5     |
| Inspector: PROPERTIES header in Inter 600 uppercase umber-500              | 6     |
| Inspector: selection count badge in vellum-200 chip                        | 6     |
| Inspector: component title in EB Garamond 500 1rem umber-900               | 7     |
| Inspector: period attribute brass-500 pill chips for rooms                 | 8     |
| Inspector: fractional-inch chips (1/16" through 7/8") in opening inspector | 8     |
| Status bar: floor tabs with brass bottom border on active tab              | 9     |
| Status bar: placeholder spans for tool, coords, snap, zoom                 | 9     |

**Items not covered in this plan:**

- Wordmark styled at 1.25rem EB Garamond (spec says Inter 600): the spec's top-bar
  section lists "Vernacular" in Inter 600, not EB Garamond. No change needed.
- Zoom controls (minus, readout, plus): the spec defines them but no zoom state is
  exposed in the current shell; deferred to the editor-experience-makeover plan.
- Scale display ("Scale 1:48"): requires project-level scale metadata not yet in the
  model; deferred.
- Cursor coordinates in the status bar: requires canvas event wiring; spans are
  stubbed and will be filled when the plan-view layer exposes pointer position.
- Snap status in the status bar: snap state is in `SnapPreferencesStore`, which
  the status bar can read; deferred to avoid coupling the status bar to the snap
  subsystem before the full status bar wiring cycle.
- Custom SVG icons for Period section: spec defers to the Period component asset
  track. Phosphor approximations used.

**Placeholder scan:** no TBD, TODO, or vague steps. Every step contains exact code
and exact commands.

**Type consistency:**

- `ToolId` is extended once in Cycle 1; all subsequent cycles reference `'pan'`
  which is defined at that point.
- `ViewOverlayValue` is defined in Cycle 5; the `useViewOverlay` hook is called in
  `ShellHeader` which mounts inside `ViewOverlayProvider` added in Cycle 5.
- `AppFrameProps.statusBar` is optional; callers without it (including the existing
  app-frame tests that do not pass it) are unaffected.
- `FloorSummary` is already exported from `floor-switcher.tsx` and imported in
  `status-bar.tsx`.
- `PeriodTags` is exported from `inspector.tsx` for isolation testing in Cycle 8;
  other inspector internals remain unexported.
