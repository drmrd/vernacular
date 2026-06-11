# Application Layout Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing fixed three-column editor grid into a responsive, theme-aware application frame built on the design-system tokens and primitives: a collapsible and resizable left tool rail, a central canvas/viewport area, and a collapsible and resizable right inspector, with named panel-slot seams that sibling tracks (the structure floor switcher and the paint color and finish pickers) mount into later.

**Architecture:** The layout is decomposed so that the geometry and the state are pure and unit-testable and only thin React glue holds element refs. Pure modules in `editor/design-system/` own the layout state: `usePaneCollapse` (a collapse-toggle reducer), `clampPaneSize` plus `usePaneResize` (a keyboard-and-pointer resize hook), and `useBreakpoint` (an observer that maps the frame width to a named breakpoint). A presentational `AppFrame` primitive composes a `<header>` slot, a left `<aside>` rail, a central `<main>`, and a right `<aside>` inspector as a CSS grid that reads pane sizes and collapse state from data attributes and custom properties, with responsive column behavior at named breakpoints driven entirely by tokens. A `PanelSlot` primitive defines the seam contract: a labeled region with a stable `slotId` that renders its children or an `EmptyState` placeholder, so sibling tracks plug panels in by id without editing the frame. The existing `EditorShell` is refactored to delegate its layout to `AppFrame`, passing its current toolbar, tools nav, plan view, three-dimensional preview, and inspector content into the frame's slots; every existing landmark, label, and behavior the current shell test pins is preserved. The shell's stylesheet is migrated from hard-coded hex to the semantic tokens, and the app root wraps the editor in the existing `ThemeProvider` so the whole frame is theme-aware. No new top-level layer is created; everything lands under `editor/` (and one provider wire-up in `app/`), all of which `editor/` is already allowed to import.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 19, plain CSS custom properties and CSS grid (no styling or layout library), the existing `editor/design-system/` tokens, `ThemeProvider`, `Stack`, `Button`, and `EmptyState` primitives, Vitest + Testing Library (jsdom) for unit and component tests, `@testing-library/user-event` for interaction. No new dependencies (a 30-day cooldown applies).

---

## Scope boundary (ADR-0044 user-experience foundation; the layout-shell piece the design-system slice deferred)

ADR-0044 names a **user-experience foundation** track whose first deliverable is "a design-system foundation (design tokens, theming through CSS custom properties, component primitives, **the layout shell**, and empty and loading states)." The design-system foundation slice (`docs/plans/2026-06-09-design-system-foundation.md`) shipped the tokens, theming, primitives, and status states but **deliberately deferred the layout shell and the live app wiring** (see that plan's "Coordination and shared-file notes": "Adopting `ThemeProvider` at the app root and migrating existing components are deliberately deferred"). This track is exactly that deferred layout-shell piece.

**In scope (this plan):**

- A responsive, split-pane application frame on the existing tokens and primitives: left tool rail, central canvas/viewport, right inspector.
- Panes collapsible (toggle to/from a thin collapsed state) and resizable (keyboard and pointer), with the size persisted in React state only for this slice.
- Responsive behavior across named breakpoints (wide, medium, narrow) driven by tokens.
- Keyboard accessibility and theme-awareness (the frame reads only semantic tokens and is wrapped in the existing `ThemeProvider`).
- Refactor (not replace) the existing `EditorShell` to delegate layout to the new `AppFrame`, preserving every landmark and behavior the current shell test asserts.
- Named **panel-slot seams** for sibling tracks: a slot where the structure track's floor switcher mounts, and slots where the paint track's color and finish pickers and inspector mount. **Only the slot contract is built here; the sibling panels are not.**

**Out of scope (named so it is not silently assumed):**

- The floor switcher, the color picker, the finish picker, and any structure or paint content (sibling tracks own these; this slice ships only the empty slots they mount into).
- Persisting pane sizes, collapse state, or the theme choice to `LibraryStore` (the settings slice owns `LibraryStore`; this slice keeps layout and theme state in React only).
- A settings or theme-switcher UI surface (deferred to the settings slice; the frame is theme-aware via the provider, but choosing the theme is a later surface).
- Touching `eslint.config.js`, `vite.config.ts`, the tsconfig files, `.storybook/*`, `package.json`, or the lockfile.
- Any `core/`, `engine/`, or `bridge/` change. This slice stays within `editor/` plus one provider wire-up in `app/app.tsx`.

---

## How this reconciles with the existing shell and the three-dimensional track

This was verified by reading the worktree before planning, so the reconciliation is concrete rather than assumed:

- **The existing shell is `editor/shell/editor-shell.tsx` + `editor-shell.css`.** It is a single CSS grid (`grid-template-columns: 11rem 1fr 15rem`; areas `toolbar`, `tools`, `viewport`, `inspector`) with **hard-coded hex** colors, **no theme wiring**, **no collapse**, **no resize**, and **no responsive breakpoints**. Its landmarks are a `banner` header, a `navigation` named "Tools", a `main` named "Viewport", a `region` named "3D preview", and a `complementary` named "Inspector". The shell test (`editor-shell.test.tsx`) pins exactly those landmarks plus the project-controls behaviors.
- **The three-dimensional render-harness track did NOT introduce a separate split-pane shell.** A tree-wide grep for `split.?pane`, `resizable`, `breakpoint`, `responsive`, `@media`, `collaps`, and `drawer` found no layout component anywhere in `editor/`, `bridge/`, or `engine/`. The only thing the 3D track added to the shell is the `SceneCanvas` import and the `<section aria-label="3D preview">` that holds it, both already inside `editor-shell.tsx`. ADR-0044 lists "split-pane" under the 3D-preview track's deliverables, but in this integration branch that work resolved to the single `editor-shell.tsx` grid above, not a standalone component. **There is therefore no parallel shell to unify with; this track is the one place the split-pane frame is built, and it absorbs the existing grid.**
- **Reconciliation strategy: extend, do not duplicate.** The new `AppFrame` is the layout container; `EditorShell` keeps ownership of _what content_ goes in each region (its toolbar, `ToolsNav`, `PlanView`, `SceneCanvas`, and `Inspector` are untouched) and is refactored to pass that content into `AppFrame`'s slots. Every existing landmark and its accessible name is preserved verbatim, so the existing `editor-shell.test.tsx` continues to pass unchanged.

**Files extended (modified) vs added (new):**

- **Extended:** `editor/shell/editor-shell.tsx` (delegates layout to `AppFrame`; content unchanged), `editor/shell/editor-shell.css` (hard-coded hex migrated to semantic tokens; collapse and responsive rules added), `editor/design-system/index.ts` (re-export the new primitives and hooks), `app/app.tsx` (wrap the editor in `ThemeProvider`).
- **Added:** `editor/design-system/use-breakpoint.ts` (+ test), `editor/design-system/pane-size.ts` (+ test, the pure `clampPaneSize`), `editor/design-system/use-pane-resize.ts` (+ test), `editor/design-system/use-pane-collapse.ts` (+ test), `editor/design-system/app-frame.tsx` + `app-frame.css` (+ test), `editor/design-system/panel-slot.tsx` + `panel-slot.css` (+ test), `editor/shell/shell-panel-slots.ts` (the slot-id contract constants, + test).

---

## The panel-slot seam contract (the cross-track interface)

Recorded here so the structure and paint tracks consume the same contract without editing the frame.

A **panel slot** is a labeled, addressable region inside the frame's left rail or right inspector. A sibling track mounts content into a slot by rendering a `PanelSlot` (or by passing children for a known `slotId`); it never edits `AppFrame` or `EditorShell` layout. The contract:

```ts
// editor/design-system/panel-slot.tsx
export interface PanelSlotProps {
  slotId: string // stable, descriptive id; the cross-track address (no cryptic codes)
  label: string // the region's accessible name
  children?: ReactNode // the mounted panel, or undefined to show the placeholder
  emptyTitle?: string // EmptyState title shown when no children (default: label)
  emptyDescription?: string // optional EmptyState description
}
```

`PanelSlot` renders a `<section role="region" aria-label={label} data-slot-id={slotId}>`. With `children`, it renders them; without, it renders the design-system `EmptyState` so an unfilled seam reads as an intentional "nothing here yet" surface rather than a blank gap. The stable `slotId` constants are exported from `editor/shell/shell-panel-slots.ts`:

```ts
// editor/shell/shell-panel-slots.ts
export const FLOOR_SWITCHER_SLOT = 'floor-switcher' // structure track mounts the floor switcher here (rail)
export const PAINT_PICKER_SLOT = 'paint-pickers' // paint track mounts color and finish pickers here (inspector)
export const PAINT_INSPECTOR_SLOT = 'paint-inspector' // paint track mounts the surface paint inspector here (inspector)
```

This slice renders these three slots **empty** (the `EmptyState` placeholder). The sibling tracks fill them later by importing the constant and rendering their panel into the matching slot; the slot ids are the only shared surface, so there is no layout merge conflict.

---

## Conventions every task must honor

- **Red-green-blue:** each behavior gets a failing test first, then the minimal implementation, then a Clean Code pass. The BLUE phase ends with a `refactor:` commit even when empty.
- **Conventional Commits**, descriptive subjects, no milestone tags, no `Co-Authored-By`, no em-dashes.
- **ESLint zero-problems including warnings:** functions under 40 lines, files under 300, three params or fewer (use an options object beyond that), no nested ternaries, no magic numbers (lift to named `const`s; `no-magic-numbers` ignores only `-1, 0, 1, 2, 100`). React glue is split into small components and hooks for this reason; the slice boundaries below reflect it.
- **No raw hex in any `.tsx` or in any component `.css` except `tokens.css`.** Components and `editor-shell.css` reference `var(--semantic-token)` only after the migration task.
- **Run the focused test before and after each implementation step.** Use `pnpm exec vitest run <path>` (the project memo notes `pnpm test -- <x>` does not filter and breaks `--coverage`).
- **The test-author and implementer never share files.** Each task names the exact test file and the exact implementation file(s); the orchestrator dispatches them separately.

---

## File structure

All paths are relative to the worktree root (`/Users/dan/workspace/vernacular.wt/app-layout-shell/`).

| File                                             | New / Modified | Responsibility                                                                                                                                                                                                                   |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor/design-system/use-breakpoint.ts`         | New            | Pure `breakpointForWidth(width)` mapping a pixel width to `'wide' \| 'medium' \| 'narrow'`, plus a `useBreakpoint(ref)` hook observing an element's width via `ResizeObserver`.                                                  |
| `editor/design-system/use-breakpoint.test.ts`    | New            | Unit tests over `breakpointForWidth` (the boundary table) and `useBreakpoint` (observed width to named breakpoint, mocked `ResizeObserver`).                                                                                     |
| `editor/design-system/pane-size.ts`              | New            | Pure `clampPaneSize(requested, { min, max })` returning a rem size bounded to `[min, max]`. No React.                                                                                                                            |
| `editor/design-system/pane-size.test.ts`         | New            | Unit tests over `clampPaneSize`: below-min, above-max, in-range, equal-bound cases.                                                                                                                                              |
| `editor/design-system/use-pane-collapse.ts`      | New            | `usePaneCollapse(initial)` hook: `{ collapsed, toggle, setCollapsed }`. The collapse-state reducer for one pane.                                                                                                                 |
| `editor/design-system/use-pane-collapse.test.ts` | New            | Unit tests over `usePaneCollapse` via `renderHook`: default, toggle flips, `setCollapsed` sets.                                                                                                                                  |
| `editor/design-system/use-pane-resize.ts`        | New            | `usePaneResize({ initial, min, max })` hook: `{ size, onResizeStep, onResizeTo }` where `onResizeStep(delta)` and `onResizeTo(value)` clamp through `clampPaneSize`.                                                             |
| `editor/design-system/use-pane-resize.test.ts`   | New            | Unit tests over `usePaneResize` via `renderHook`: stepping up and down clamps to bounds; `onResizeTo` clamps an absolute value.                                                                                                  |
| `editor/design-system/panel-slot.tsx`            | New            | The `PanelSlot` primitive: a labeled `region` with a stable `data-slot-id` that renders children or an `EmptyState` placeholder. The cross-track seam.                                                                           |
| `editor/design-system/panel-slot.css`            | New            | Token-only styling for the slot container.                                                                                                                                                                                       |
| `editor/design-system/panel-slot.test.tsx`       | New            | Component tests: renders children when given; renders the labeled empty placeholder when not; exposes `data-slot-id` and the accessible name.                                                                                    |
| `editor/design-system/app-frame.tsx`             | New            | The `AppFrame` presentational layout primitive: header slot, collapsible/resizable left rail, central main, collapsible/resizable right inspector; a CSS grid driven by data attributes and size custom properties.              |
| `editor/design-system/app-frame.css`             | New            | Token-only CSS grid, collapse states, resize handles, and the responsive breakpoint rules (wide three-column, medium two-column, narrow stacked).                                                                                |
| `editor/design-system/app-frame.test.tsx`        | New            | Component tests: renders the four regions with their labels; the rail and inspector collapse toggles flip `aria-expanded` and the collapsed data attribute; the resize handles are keyboard-operable sliders.                    |
| `editor/design-system/index.ts`                  | Modified       | Re-export `AppFrame`, `PanelSlot`, `useBreakpoint`, `breakpointForWidth`, `clampPaneSize`, `usePaneCollapse`, `usePaneResize`, and their public types.                                                                           |
| `editor/shell/shell-panel-slots.ts`              | New            | The three stable slot-id constants (`FLOOR_SWITCHER_SLOT`, `PAINT_PICKER_SLOT`, `PAINT_INSPECTOR_SLOT`).                                                                                                                         |
| `editor/shell/shell-panel-slots.test.ts`         | New            | A pin on the slot-id values and their uniqueness, so a later rename is a deliberate, reviewed change.                                                                                                                            |
| `editor/shell/editor-shell.tsx`                  | Modified       | Refactored to delegate layout to `AppFrame`, passing the existing toolbar, tools nav, plan view, three-dimensional preview, and inspector content into the frame's slots, plus the three empty sibling slots. Content unchanged. |
| `editor/shell/editor-shell.css`                  | Modified       | Hard-coded hex migrated to semantic tokens; the local grid removed in favor of `app-frame.css`; the toolbar, tools, and inspector chrome restyled with tokens.                                                                   |
| `app/app.tsx`                                    | Modified       | Wrap the editor workspace in the existing `ThemeProvider` so the frame is theme-aware end to end.                                                                                                                                |

**Not modified:** `editor/design-system/tokens.css`, `tokens.ts`, `theme.ts`, `theme-provider.tsx`, `button.tsx`, `stack.tsx`, `status.tsx` and their CSS (consumed, not changed); `editor/plan/*`, `editor/tools/*` (the content components, untouched); `eslint.config.js`, `vite.config.ts`, the tsconfig files, `.storybook/*`, `package.json`, the lockfile; everything in `core/`, `engine/`, `bridge/`, and `storage/`.

---

## Slice list

1. **Breakpoint detection** (pure mapping + `ResizeObserver` hook): Tasks 1, 2.
2. **Pane size clamping and resize state** (pure `clampPaneSize`, `usePaneResize`, `usePaneCollapse`): Tasks 3, 4, 5.
3. **The panel-slot seam** (`PanelSlot` primitive + the shell slot-id constants): Tasks 6, 7.
4. **The application frame** (`AppFrame` layout primitive: regions, collapse, resize, responsive grid): Tasks 8, 9, 10.
5. **Public surface and shell integration** (barrel re-exports, `EditorShell` delegates to `AppFrame`, css migrated to tokens, app wrapped in `ThemeProvider`): Tasks 11, 12, 13, 14.

Each task is one small testable behavior with its own RGB cycle. Tasks 9 and 10 split `AppFrame`'s behaviors (collapse, then resize) into separate cycles so each `AppFrame` change stays under the 40-line-per-function and 300-line-per-file limits and each behavior has its own failing test first.

---

## Slice 1: Breakpoint detection

### Task 1: `breakpointForWidth` maps a width to a named breakpoint

**Files:**

- Create: `editor/design-system/use-breakpoint.ts`
- Test: `editor/design-system/use-breakpoint.test.ts`

The named breakpoints and their pixel thresholds are the cross-slice constants the responsive CSS also keys off. Wide is the full three-column frame, medium drops to two columns (the inspector overlays or collapses by default), narrow stacks the regions.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/use-breakpoint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { breakpointForWidth, WIDE_MIN_WIDTH, MEDIUM_MIN_WIDTH } from './use-breakpoint'

describe('breakpointForWidth', () => {
  it('reports wide at and above the wide threshold', () => {
    expect(breakpointForWidth(WIDE_MIN_WIDTH)).toBe('wide')
    expect(breakpointForWidth(WIDE_MIN_WIDTH + 1)).toBe('wide')
  })

  it('reports medium between the medium and wide thresholds', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH)).toBe('medium')
    expect(breakpointForWidth(WIDE_MIN_WIDTH - 1)).toBe('medium')
  })

  it('reports narrow below the medium threshold', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH - 1)).toBe('narrow')
    expect(breakpointForWidth(0)).toBe('narrow')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/use-breakpoint.test.ts`
Expected: FAIL (cannot resolve `./use-breakpoint`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/use-breakpoint.ts` with the pure mapping (the hook is added in Task 2):

```ts
export type Breakpoint = 'wide' | 'medium' | 'narrow'

export const WIDE_MIN_WIDTH = 1024
export const MEDIUM_MIN_WIDTH = 640

export function breakpointForWidth(width: number): Breakpoint {
  if (width >= WIDE_MIN_WIDTH) {
    return 'wide'
  }
  if (width >= MEDIUM_MIN_WIDTH) {
    return 'medium'
  }
  return 'narrow'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/use-breakpoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/use-breakpoint.ts editor/design-system/use-breakpoint.test.ts`
Expected: zero problems. The two thresholds are named `const`s, so `no-magic-numbers` is satisfied.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/use-breakpoint.ts editor/design-system/use-breakpoint.test.ts
git commit -m "feat: map a frame width to a named layout breakpoint"
```

- [ ] **Step 7: BLUE review and refactor**

Review against `.claude/rules.md`: the thresholds are named, the function is a single small mapping with no nested ternary, the type is an explicit union. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: breakpoint mapping (no changes needed)"
```

---

### Task 2: `useBreakpoint` observes an element's width

**Files:**

- Modify: `editor/design-system/use-breakpoint.ts`
- Test: `editor/design-system/use-breakpoint.test.ts` (add a `useBreakpoint` describe block)

The frame chooses its responsive layout from its own measured width (container-relative), not the global viewport, so a `ResizeObserver` on the frame element drives it. jsdom has no real `ResizeObserver`; the test mocks it and drives the observed width manually.

- [ ] **Step 1: Write the failing test**

Append to `editor/design-system/use-breakpoint.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useBreakpoint } from './use-breakpoint'

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void

function installResizeObserverMock(): { fire: (width: number) => void } {
  let captured: ResizeCallback | null = null
  class FakeResizeObserver {
    constructor(callback: ResizeCallback) {
      captured = callback
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return {
    fire: (width: number) => act(() => captured?.([{ contentRect: { width } }])),
  }
}

describe('useBreakpoint', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports the breakpoint for the observed element width', () => {
    const observer = installResizeObserverMock()
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null)
      const breakpoint = useBreakpoint(ref)
      return { ref, breakpoint }
    })
    // Attach a node so the effect has an element to observe.
    act(() => {
      ;(result.current.ref as { current: HTMLDivElement | null }).current =
        document.createElement('div')
    })
    observer.fire(1280)
    expect(result.current.breakpoint).toBe('wide')
    observer.fire(700)
    expect(result.current.breakpoint).toBe('medium')
    observer.fire(400)
    expect(result.current.breakpoint).toBe('narrow')
  })
})
```

Add `vi` and `afterEach` to the file's existing vitest import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/use-breakpoint.test.ts`
Expected: FAIL (`useBreakpoint` is not exported).

- [ ] **Step 3: Write the minimal implementation**

Append to `editor/design-system/use-breakpoint.ts`. Keep the observer wiring small; default to `wide` until the first measurement:

```ts
import { useEffect, useState, type RefObject } from 'react'

export function useBreakpoint(ref: RefObject<HTMLElement | null>): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('wide')
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth
      setBreakpoint(breakpointForWidth(width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return breakpoint
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/use-breakpoint.test.ts`
Expected: PASS (the pure cases and the hook case).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/use-breakpoint.ts editor/design-system/use-breakpoint.test.ts`
Expected: zero problems. The effect is one small function under 40 lines; the `typeof ResizeObserver === 'undefined'` guard keeps it safe under jsdom without a mock.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/use-breakpoint.ts editor/design-system/use-breakpoint.test.ts
git commit -m "feat: observe an element width and report its layout breakpoint"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the effect cleans up the observer, falls back gracefully where `ResizeObserver` is absent, and reuses the pure `breakpointForWidth`. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: breakpoint hook (no changes needed)"
```

---

## Slice 2: Pane size clamping and resize state

### Task 3: `clampPaneSize` bounds a requested pane size

**Files:**

- Create: `editor/design-system/pane-size.ts`
- Test: `editor/design-system/pane-size.test.ts`

Pane sizes are kept in `rem` (matching the token spacing scale). The clamp is pure and shared by both the resize hook and any future persisted-size restore.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/pane-size.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clampPaneSize } from './pane-size'

const bounds = { min: 8, max: 24 }

describe('clampPaneSize', () => {
  it('returns an in-range size unchanged', () => {
    expect(clampPaneSize(16, bounds)).toBe(16)
  })

  it('raises a below-min size to the minimum', () => {
    expect(clampPaneSize(2, bounds)).toBe(8)
  })

  it('lowers an above-max size to the maximum', () => {
    expect(clampPaneSize(40, bounds)).toBe(24)
  })

  it('keeps a size that sits exactly on a bound', () => {
    expect(clampPaneSize(8, bounds)).toBe(8)
    expect(clampPaneSize(24, bounds)).toBe(24)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/pane-size.test.ts`
Expected: FAIL (cannot resolve `./pane-size`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/pane-size.ts`:

```ts
export interface PaneSizeBounds {
  min: number
  max: number
}

export function clampPaneSize(requested: number, bounds: PaneSizeBounds): number {
  return Math.min(Math.max(requested, bounds.min), bounds.max)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/pane-size.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/pane-size.ts editor/design-system/pane-size.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/pane-size.ts editor/design-system/pane-size.test.ts
git commit -m "feat: clamp a requested pane size to its bounds"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the bounds are an options object (not two positional params), the function is a single expression, no magic numbers in the implementation (the bounds come from the caller). Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: pane-size clamp (no changes needed)"
```

---

### Task 4: `usePaneCollapse` toggles a pane's collapsed state

**Files:**

- Create: `editor/design-system/use-pane-collapse.ts`
- Test: `editor/design-system/use-pane-collapse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/use-pane-collapse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaneCollapse } from './use-pane-collapse'

describe('usePaneCollapse', () => {
  it('defaults to the initial collapsed state', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    expect(result.current.collapsed).toBe(false)
  })

  it('toggle flips the collapsed state', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
  })

  it('setCollapsed sets the state explicitly', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    act(() => result.current.setCollapsed(true))
    expect(result.current.collapsed).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/use-pane-collapse.test.ts`
Expected: FAIL (cannot resolve `./use-pane-collapse`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/use-pane-collapse.ts`:

```ts
import { useCallback, useState } from 'react'

export interface PaneCollapse {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

export function usePaneCollapse(initial: boolean): PaneCollapse {
  const [collapsed, setCollapsed] = useState(initial)
  const toggle = useCallback(() => setCollapsed((value) => !value), [])
  return { collapsed, toggle, setCollapsed }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/use-pane-collapse.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/use-pane-collapse.ts editor/design-system/use-pane-collapse.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/use-pane-collapse.ts editor/design-system/use-pane-collapse.test.ts
git commit -m "feat: add a pane collapse-state hook"
```

- [ ] **Step 7: BLUE review and refactor**

Review: `toggle` is memoized, the shape is a small explicit interface, no DOM. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: pane collapse hook (no changes needed)"
```

---

### Task 5: `usePaneResize` steps and sets a clamped pane size

**Files:**

- Create: `editor/design-system/use-pane-resize.ts`
- Test: `editor/design-system/use-pane-resize.test.ts`

`onResizeStep(delta)` is the keyboard path (arrow keys nudge by a step); `onResizeTo(value)` is the pointer path (drag computes an absolute size). Both clamp through `clampPaneSize`.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/use-pane-resize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaneResize } from './use-pane-resize'

const options = { initial: 16, min: 8, max: 24 }

describe('usePaneResize', () => {
  it('starts at the initial size', () => {
    const { result } = renderHook(() => usePaneResize(options))
    expect(result.current.size).toBe(16)
  })

  it('steps the size and clamps to the maximum', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeStep(4))
    expect(result.current.size).toBe(20)
    act(() => result.current.onResizeStep(100))
    expect(result.current.size).toBe(24)
  })

  it('steps down and clamps to the minimum', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeStep(-100))
    expect(result.current.size).toBe(8)
  })

  it('sets an absolute size clamped to bounds', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeTo(40))
    expect(result.current.size).toBe(24)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/use-pane-resize.test.ts`
Expected: FAIL (cannot resolve `./use-pane-resize`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/use-pane-resize.ts`. Reuse the pure clamp so the bound rule is not duplicated:

```ts
import { useCallback, useState } from 'react'
import { clampPaneSize, type PaneSizeBounds } from './pane-size'

export interface PaneResizeOptions extends PaneSizeBounds {
  initial: number
}

export interface PaneResize {
  size: number
  onResizeStep: (delta: number) => void
  onResizeTo: (value: number) => void
}

export function usePaneResize(options: PaneResizeOptions): PaneResize {
  const { initial, min, max } = options
  const [size, setSize] = useState(() => clampPaneSize(initial, { min, max }))
  const onResizeStep = useCallback(
    (delta: number) => setSize((current) => clampPaneSize(current + delta, { min, max })),
    [min, max],
  )
  const onResizeTo = useCallback(
    (value: number) => setSize(clampPaneSize(value, { min, max })),
    [min, max],
  )
  return { size, onResizeStep, onResizeTo }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/use-pane-resize.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/use-pane-resize.ts editor/design-system/use-pane-resize.test.ts`
Expected: zero problems. Both callbacks are memoized; the options object keeps the param count at one.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/use-pane-resize.ts editor/design-system/use-pane-resize.test.ts
git commit -m "feat: add a clamped pane resize-state hook"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the clamp rule lives only in `clampPaneSize` (DRY), the hook takes a single options object, and the initial size is clamped at mount. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: pane resize hook (no changes needed)"
```

---

## Slice 3: The panel-slot seam

### Task 6: `PanelSlot` renders children or a labeled empty placeholder

**Files:**

- Create: `editor/design-system/panel-slot.tsx`
- Create: `editor/design-system/panel-slot.css`
- Test: `editor/design-system/panel-slot.test.tsx`

`PanelSlot` is the cross-track seam: sibling tracks mount panels by `slotId` without editing the frame. With children it renders them; without, it renders the design-system `EmptyState` so an unfilled seam is an intentional surface.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/panel-slot.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PanelSlot } from './panel-slot'

afterEach(cleanup)

describe('PanelSlot', () => {
  it('renders a labeled region with its slot id', () => {
    render(<PanelSlot slotId="floor-switcher" label="Floors" />)
    const region = screen.getByRole('region', { name: 'Floors' })
    expect(region).toHaveAttribute('data-slot-id', 'floor-switcher')
  })

  it('renders its children when given', () => {
    render(
      <PanelSlot slotId="paint-pickers" label="Paint">
        <button>Pick color</button>
      </PanelSlot>,
    )
    expect(screen.getByRole('button', { name: 'Pick color' })).toBeInTheDocument()
  })

  it('renders an empty placeholder titled by the label when no children are given', () => {
    render(<PanelSlot slotId="paint-pickers" label="Paint" />)
    expect(screen.getByRole('heading', { name: 'Paint' })).toBeInTheDocument()
  })

  it('uses an explicit empty title and description when provided', () => {
    render(
      <PanelSlot
        slotId="paint-pickers"
        label="Paint"
        emptyTitle="No paint yet"
        emptyDescription="Pick a surface to paint it."
      />,
    )
    expect(screen.getByRole('heading', { name: 'No paint yet' })).toBeInTheDocument()
    expect(screen.getByText('Pick a surface to paint it.')).toBeInTheDocument()
  })
})
```

Note: `EmptyState` renders its title in an `<h2>`, and the slot's own `aria-label` already names the region, so the empty placeholder's heading is what the test queries (the slot region keeps the `Paint` name; the `EmptyState` inside contributes the heading).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/panel-slot.test.tsx`
Expected: FAIL (cannot resolve `./panel-slot`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/panel-slot.tsx`. Compose the existing `EmptyState`; do not reimplement an empty surface:

```tsx
import type { ReactNode } from 'react'
import { EmptyState } from './status'
import './panel-slot.css'

export interface PanelSlotProps {
  slotId: string
  label: string
  children?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
}

export function PanelSlot({
  slotId,
  label,
  children,
  emptyTitle,
  emptyDescription,
}: PanelSlotProps) {
  return (
    <section className="ds-panel-slot" role="region" aria-label={label} data-slot-id={slotId}>
      {children ?? (
        <EmptyState
          title={emptyTitle ?? label}
          {...(emptyDescription ? { description: emptyDescription } : {})}
        />
      )}
    </section>
  )
}
```

The `{...(emptyDescription ? ... : {})}` spread keeps `exactOptionalPropertyTypes` happy (it rejects an explicit `undefined` for the optional `description`), matching the pattern already used in `app/app.tsx`.

Create `editor/design-system/panel-slot.css`, token-only:

```css
.ds-panel-slot {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/panel-slot.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/panel-slot.tsx editor/design-system/panel-slot.test.tsx`
Expected: zero problems. The component is one small function; props are five named fields (not positional), within the param budget because they arrive as one destructured object.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/panel-slot.tsx editor/design-system/panel-slot.css editor/design-system/panel-slot.test.tsx
git commit -m "feat: add the PanelSlot seam with an empty-state placeholder"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the empty surface reuses `EmptyState` (no duplicated markup), the region's accessible name comes from `label`, the optional `description` is spread conditionally, and the CSS is token-only. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: PanelSlot seam (no changes needed)"
```

---

### Task 7: The shell slot-id contract constants

**Files:**

- Create: `editor/shell/shell-panel-slots.ts`
- Test: `editor/shell/shell-panel-slots.test.ts`

These three descriptive ids are the cross-track address book. Pinning them in a test makes any later rename a deliberate, reviewed change that the sibling tracks see.

- [ ] **Step 1: Write the failing test**

Create `editor/shell/shell-panel-slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  FLOOR_SWITCHER_SLOT,
  PAINT_PICKER_SLOT,
  PAINT_INSPECTOR_SLOT,
  SHELL_PANEL_SLOTS,
} from './shell-panel-slots'

describe('shell panel slots', () => {
  it('names the floor switcher, paint pickers, and paint inspector seams', () => {
    expect(FLOOR_SWITCHER_SLOT).toBe('floor-switcher')
    expect(PAINT_PICKER_SLOT).toBe('paint-pickers')
    expect(PAINT_INSPECTOR_SLOT).toBe('paint-inspector')
  })

  it('lists every slot id with no duplicates', () => {
    expect(new Set(SHELL_PANEL_SLOTS).size).toBe(SHELL_PANEL_SLOTS.length)
    expect(SHELL_PANEL_SLOTS).toContain(FLOOR_SWITCHER_SLOT)
    expect(SHELL_PANEL_SLOTS).toContain(PAINT_PICKER_SLOT)
    expect(SHELL_PANEL_SLOTS).toContain(PAINT_INSPECTOR_SLOT)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/shell/shell-panel-slots.test.ts`
Expected: FAIL (cannot resolve `./shell-panel-slots`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/shell/shell-panel-slots.ts`:

```ts
// The stable, cross-track slot-id contract. Sibling tracks mount panels into the
// frame by importing the matching constant and rendering a PanelSlot with that id;
// they never edit the shell layout. Renaming an id is a deliberate, reviewed change
// because shell-panel-slots.test.ts pins these values.

export const FLOOR_SWITCHER_SLOT = 'floor-switcher'
export const PAINT_PICKER_SLOT = 'paint-pickers'
export const PAINT_INSPECTOR_SLOT = 'paint-inspector'

export const SHELL_PANEL_SLOTS = [
  FLOOR_SWITCHER_SLOT,
  PAINT_PICKER_SLOT,
  PAINT_INSPECTOR_SLOT,
] as const
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/shell/shell-panel-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/shell/shell-panel-slots.ts editor/shell/shell-panel-slots.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/shell/shell-panel-slots.ts editor/shell/shell-panel-slots.test.ts
git commit -m "feat: define the cross-track shell panel-slot ids"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the ids are descriptive English (no cryptic codes), the `as const` list is the single source for the set, the WHY comment explains the contract. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: shell panel-slot ids (no changes needed)"
```

---

## Slice 4: The application frame

### Task 8: `AppFrame` renders the four labeled regions

**Files:**

- Create: `editor/design-system/app-frame.tsx`
- Create: `editor/design-system/app-frame.css`
- Test: `editor/design-system/app-frame.test.tsx`

`AppFrame` is presentational and content-agnostic: it takes `header`, `rail`, `main`, and `inspector` slots and lays them out as a CSS grid. This task pins only that the regions render with their labels and the right roles. Collapse (Task 9) and resize (Task 10) follow as separate cycles so each behavior has its own failing test and each `AppFrame` change stays small.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/app-frame.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AppFrame } from './app-frame'

afterEach(cleanup)

function renderFrame() {
  render(
    <AppFrame
      header={<h1>Vernacular</h1>}
      rail={<p>rail content</p>}
      railLabel="Tools"
      main={<p>canvas content</p>}
      mainLabel="Viewport"
      inspector={<p>inspector content</p>}
      inspectorLabel="Inspector"
    />,
  )
}

describe('AppFrame', () => {
  it('renders a banner header with its content', () => {
    renderFrame()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Vernacular' })).toBeInTheDocument()
  })

  it('renders the rail as a labeled complementary region with its content', () => {
    renderFrame()
    expect(screen.getByRole('complementary', { name: 'Tools' })).toBeInTheDocument()
    expect(screen.getByText('rail content')).toBeInTheDocument()
  })

  it('renders the central area as a labeled main with its content', () => {
    renderFrame()
    expect(screen.getByRole('main', { name: 'Viewport' })).toBeInTheDocument()
    expect(screen.getByText('canvas content')).toBeInTheDocument()
  })

  it('renders the inspector as a labeled complementary region with its content', () => {
    renderFrame()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument()
    expect(screen.getByText('inspector content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: FAIL (cannot resolve `./app-frame`).

- [ ] **Step 3: Write the minimal implementation**

Create `editor/design-system/app-frame.tsx`. Keep the component a flat composition of the four regions; the breakpoint, collapse, and resize wiring arrive in later tasks. Use a ref + `useBreakpoint` so the grid carries the current breakpoint as a data attribute:

```tsx
import { useRef, type ReactNode } from 'react'
import { useBreakpoint } from './use-breakpoint'
import './app-frame.css'

export interface AppFrameProps {
  header: ReactNode
  rail: ReactNode
  railLabel: string
  main: ReactNode
  mainLabel: string
  inspector: ReactNode
  inspectorLabel: string
}

export function AppFrame(props: AppFrameProps) {
  const { header, rail, railLabel, main, mainLabel, inspector, inspectorLabel } = props
  const frameRef = useRef<HTMLDivElement>(null)
  const breakpoint = useBreakpoint(frameRef)
  return (
    <div ref={frameRef} className="ds-app-frame" data-breakpoint={breakpoint}>
      <header className="ds-app-frame__header" role="banner">
        {header}
      </header>
      <aside className="ds-app-frame__rail" aria-label={railLabel}>
        {rail}
      </aside>
      <main className="ds-app-frame__main" aria-label={mainLabel}>
        {main}
      </main>
      <aside className="ds-app-frame__inspector" aria-label={inspectorLabel}>
        {inspector}
      </aside>
    </div>
  )
}
```

Create `editor/design-system/app-frame.css`. Token-only grid; the responsive rules key off the `data-breakpoint` attribute the component sets:

```css
.ds-app-frame {
  display: grid;
  grid-template-columns: var(--ds-rail-size, 11rem) 1fr var(--ds-inspector-size, 15rem);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'header header header'
    'rail main inspector';
  gap: var(--space-3);
  box-sizing: border-box;
  min-height: 100vh;
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-family-ui);
}

.ds-app-frame__header {
  grid-area: header;
}
.ds-app-frame__rail {
  grid-area: rail;
}
.ds-app-frame__main {
  grid-area: main;
  min-width: 0;
}
.ds-app-frame__inspector {
  grid-area: inspector;
  min-width: 0;
}

/* Medium: drop the rail into the main column header strip is kept; inspector stays. */
.ds-app-frame[data-breakpoint='medium'] {
  grid-template-columns: 1fr var(--ds-inspector-size, 15rem);
  grid-template-areas:
    'header header'
    'main inspector';
}

.ds-app-frame[data-breakpoint='medium'] .ds-app-frame__rail {
  display: none;
}

/* Narrow: stack every region in one column. */
.ds-app-frame[data-breakpoint='narrow'] {
  grid-template-columns: 1fr;
  grid-template-areas:
    'header'
    'main'
    'inspector';
}

.ds-app-frame[data-breakpoint='narrow'] .ds-app-frame__rail {
  display: none;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: PASS. (jsdom does not run `ResizeObserver`, so the breakpoint stays the default `wide`; the test asserts only the regions and labels, which are breakpoint-independent.)

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/app-frame.tsx editor/design-system/app-frame.test.tsx`
Expected: zero problems. The component is a single function under 40 lines; props arrive as one object so `max-params` is satisfied; no raw hex in the CSS.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/app-frame.tsx editor/design-system/app-frame.css editor/design-system/app-frame.test.tsx
git commit -m "feat: add the AppFrame layout primitive regions"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the four regions use the correct landmark roles, the labels are props (not hard-coded), the grid and responsive rules reference only tokens and the `data-breakpoint` attribute, and the component holds no business logic. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: AppFrame regions (no changes needed)"
```

---

### Task 9: The rail and inspector collapse toggles

**Files:**

- Modify: `editor/design-system/app-frame.tsx`
- Modify: `editor/design-system/app-frame.css`
- Test: `editor/design-system/app-frame.test.tsx` (add a collapse describe block)

Each side pane gets a collapse toggle button. Collapsing sets a `data-collapsed` attribute the CSS reads to shrink the pane to a thin strip, and flips the toggle's `aria-expanded`. The collapse state comes from `usePaneCollapse`.

- [ ] **Step 1: Write the failing test**

Append to `editor/design-system/app-frame.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event'

describe('AppFrame collapse', () => {
  it('exposes an expanded rail toggle that collapses the rail when pressed', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail content</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector content</p>}
        inspectorLabel="Inspector"
      />,
    )
    const toggle = screen.getByRole('button', { name: /collapse tools/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(screen.getByRole('complementary', { name: 'Tools' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('button', { name: /collapse tools/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('collapses the inspector independently of the rail', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    await user.click(screen.getByRole('button', { name: /collapse inspector/i }))
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('complementary', { name: 'Tools' })).toHaveAttribute(
      'data-collapsed',
      'false',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: FAIL (no collapse toggle exists yet).

- [ ] **Step 3: Write the minimal implementation**

Modify `editor/design-system/app-frame.tsx`. Extract a small `CollapsiblePane` component so each side pane owns its collapse button and `AppFrame` stays under 40 lines, and reuse the design-system `Button`:

```tsx
import { useRef, type ReactNode } from 'react'
import { Button } from './button'
import { usePaneCollapse } from './use-pane-collapse'
import { useBreakpoint } from './use-breakpoint'
import './app-frame.css'

interface CollapsiblePaneProps {
  area: 'rail' | 'inspector'
  label: string
  children: ReactNode
}

function CollapsiblePane({ area, label, children }: CollapsiblePaneProps) {
  const { collapsed, toggle } = usePaneCollapse(false)
  return (
    <aside className={`ds-app-frame__${area}`} aria-label={label} data-collapsed={collapsed}>
      <Button
        className="ds-app-frame__collapse"
        aria-expanded={!collapsed}
        aria-label={`Collapse ${label}`}
        onClick={toggle}
      >
        {collapsed ? '›' : '‹'}
      </Button>
      {collapsed ? null : <div className="ds-app-frame__pane-body">{children}</div>}
    </aside>
  )
}
```

Then update `AppFrame` to render the two side panes via `CollapsiblePane`:

```tsx
export function AppFrame(props: AppFrameProps) {
  const { header, rail, railLabel, main, mainLabel, inspector, inspectorLabel } = props
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
    </div>
  )
}
```

The `‹` and `›` are the single-angle-quote glyphs used as collapse and expand chevrons; the accessible name comes from `aria-label`, so the glyph is decorative.

Add to `editor/design-system/app-frame.css` a collapsed-pane rule:

```css
.ds-app-frame__rail[data-collapsed='true'],
.ds-app-frame__inspector[data-collapsed='true'] {
  --ds-rail-size: var(--space-5);
  --ds-inspector-size: var(--space-5);
}

.ds-app-frame__collapse {
  align-self: flex-end;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: PASS (regions, labels, and both collapse behaviors).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/app-frame.tsx editor/design-system/app-frame.test.tsx`
Expected: zero problems. `CollapsiblePane` and `AppFrame` are each under 40 lines; the file stays under 300.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/app-frame.tsx editor/design-system/app-frame.css editor/design-system/app-frame.test.tsx
git commit -m "feat: add collapsible rail and inspector panes to AppFrame"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the collapse button is the design-system `Button` (no bare element), `aria-expanded` reflects state, each pane owns one collapse hook (independent state), and the glyph is decorative behind an `aria-label`. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: AppFrame collapse (no changes needed)"
```

---

### Task 10: Keyboard-resizable rail and inspector handles

**Files:**

- Modify: `editor/design-system/app-frame.tsx`
- Modify: `editor/design-system/app-frame.css`
- Test: `editor/design-system/app-frame.test.tsx` (add a resize describe block)

Each side pane gains a resize handle exposed as an ARIA `separator` with `aria-orientation="vertical"` that is keyboard-operable (arrow keys step the size). The handle is focusable; arrow keys call `onResizeStep`, updating the pane size custom property. Pointer dragging is wired the same way through `onResizeTo` but is exercised by hand in a browser, not asserted in jsdom (jsdom has no layout geometry); the keyboard path is the unit-tested behavior, matching the project rule that semantic, keyboard-accessible behavior is testable while pixel geometry is not.

- [ ] **Step 1: Write the failing test**

Append to `editor/design-system/app-frame.test.tsx`:

```tsx
describe('AppFrame resize', () => {
  it('exposes a keyboard-operable vertical separator for the rail', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    const separator = screen.getByRole('separator', { name: /resize tools/i })
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    const before = Number(separator.getAttribute('aria-valuenow'))
    separator.focus()
    await user.keyboard('{ArrowRight}')
    const after = Number(
      screen.getByRole('separator', { name: /resize tools/i }).getAttribute('aria-valuenow'),
    )
    expect(after).toBeGreaterThan(before)
  })

  it('exposes a separate resize separator for the inspector', () => {
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    expect(screen.getByRole('separator', { name: /resize inspector/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: FAIL (no resize separator exists yet).

- [ ] **Step 3: Write the minimal implementation**

Extract the resize handle into its own small component `PaneResizeHandle` to keep functions under 40 lines, and add the per-pane size custom property to `CollapsiblePane`. The pane bounds are named constants:

```tsx
import { clampPaneSize } from './pane-size' // (already transitively used by the hook)
import { usePaneResize } from './use-pane-resize'

const RAIL_BOUNDS = { initial: 11, min: 8, max: 20 }
const INSPECTOR_BOUNDS = { initial: 15, min: 10, max: 28 }
const RESIZE_STEP_REM = 1

interface PaneResizeHandleProps {
  label: string
  size: number
  bounds: { min: number; max: number }
  onResizeStep: (delta: number) => void
}

function PaneResizeHandle({ label, size, bounds, onResizeStep }: PaneResizeHandleProps) {
  return (
    <div
      className="ds-app-frame__resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={size}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          onResizeStep(RESIZE_STEP_REM)
        } else if (event.key === 'ArrowLeft') {
          onResizeStep(-RESIZE_STEP_REM)
        }
      }}
    />
  )
}
```

Have `CollapsiblePane` own a `usePaneResize` keyed to its bounds, expose the size as a `--ds-${area}-size: ${size}rem` custom property on the `<aside>`, and render the `PaneResizeHandle` when not collapsed. Pass the bounds in by `area`:

```tsx
const PANE_BOUNDS = { rail: RAIL_BOUNDS, inspector: INSPECTOR_BOUNDS } as const

function CollapsiblePane({ area, label, children }: CollapsiblePaneProps) {
  const { collapsed, toggle } = usePaneCollapse(false)
  const { size, onResizeStep } = usePaneResize(PANE_BOUNDS[area])
  const style = { [`--ds-${area}-size`]: `${size}rem` } as CSSProperties
  return (
    <aside
      className={`ds-app-frame__${area}`}
      aria-label={label}
      data-collapsed={collapsed}
      style={style}
    >
      <Button
        className="ds-app-frame__collapse"
        aria-expanded={!collapsed}
        aria-label={`Collapse ${label}`}
        onClick={toggle}
      >
        {collapsed ? '›' : '‹'}
      </Button>
      {collapsed ? null : (
        <>
          <div className="ds-app-frame__pane-body">{children}</div>
          <PaneResizeHandle
            label={label}
            size={size}
            bounds={PANE_BOUNDS[area]}
            onResizeStep={onResizeStep}
          />
        </>
      )}
    </aside>
  )
}
```

Import `CSSProperties` from `react`. The `onKeyDown` branch uses `if/else if`, not a nested ternary, to satisfy `no-nested-ternary`. Remove the unused `clampPaneSize` import if eslint flags it (it is used transitively by the hook, not directly here).

Add the handle styling to `editor/design-system/app-frame.css`:

```css
.ds-app-frame__resize {
  align-self: stretch;
  width: var(--space-1);
  margin-left: auto;
  border-radius: var(--radius-sm);
  background: var(--color-border);
  cursor: col-resize;
}

.ds-app-frame__resize:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/app-frame.test.tsx`
Expected: PASS (regions, labels, collapse, and both resize behaviors).

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/app-frame.tsx editor/design-system/app-frame.test.tsx`
Expected: zero problems. `PaneResizeHandle`, `CollapsiblePane`, and `AppFrame` are each under 40 lines; the bounds and the step are named constants (`no-magic-numbers`); the keydown uses `if/else if`. If `app-frame.tsx` approaches 300 lines, split the two helper components into `editor/design-system/collapsible-pane.tsx` and re-run the suite (flag this only if needed; it should fit).

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/app-frame.tsx editor/design-system/app-frame.css editor/design-system/app-frame.test.tsx
git commit -m "feat: add keyboard-resizable rail and inspector handles to AppFrame"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the handle is an accessible `separator` with `aria-orientation`, `aria-valuenow/min/max`, and keyboard handling; the size flows through the pure clamp via `usePaneResize` (no inline bound logic); bounds and step are named; functions stay small. If the file is near 300 lines, extract the pane helpers now. Land the changes (or the empty marker if none).

```bash
git commit --allow-empty -m "refactor: AppFrame resize (no changes needed)"
```

---

## Slice 5: Public surface and shell integration

### Task 11: Re-export the layout primitives and hooks from the barrel

**Files:**

- Modify: `editor/design-system/index.ts`
- Test: extend `editor/design-system/app-frame.test.tsx` is not needed; add a tiny barrel test `editor/design-system/index.test.ts`.

The barrel is the surface `editor/shell/` imports from. A small test pins that the new names resolve from `./index`, so a missed export fails fast rather than at shell-integration time.

- [ ] **Step 1: Write the failing test**

Create `editor/design-system/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  AppFrame,
  PanelSlot,
  useBreakpoint,
  breakpointForWidth,
  clampPaneSize,
  usePaneCollapse,
  usePaneResize,
} from './index'

describe('design-system barrel', () => {
  it('exports the layout primitives and hooks', () => {
    expect(AppFrame).toBeTypeOf('function')
    expect(PanelSlot).toBeTypeOf('function')
    expect(useBreakpoint).toBeTypeOf('function')
    expect(breakpointForWidth).toBeTypeOf('function')
    expect(clampPaneSize).toBeTypeOf('function')
    expect(usePaneCollapse).toBeTypeOf('function')
    expect(usePaneResize).toBeTypeOf('function')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/design-system/index.test.ts`
Expected: FAIL (the new names are not yet exported from `./index`).

- [ ] **Step 3: Write the minimal implementation**

Append to `editor/design-system/index.ts`:

```ts
export { AppFrame } from './app-frame'
export type { AppFrameProps } from './app-frame'
export { PanelSlot } from './panel-slot'
export type { PanelSlotProps } from './panel-slot'
export { useBreakpoint, breakpointForWidth } from './use-breakpoint'
export type { Breakpoint } from './use-breakpoint'
export { clampPaneSize } from './pane-size'
export type { PaneSizeBounds } from './pane-size'
export { usePaneCollapse } from './use-pane-collapse'
export type { PaneCollapse } from './use-pane-collapse'
export { usePaneResize } from './use-pane-resize'
export type { PaneResize, PaneResizeOptions } from './use-pane-resize'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/design-system/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/design-system/index.ts editor/design-system/index.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/design-system/index.ts editor/design-system/index.test.ts
git commit -m "feat: export the layout shell primitives from the design-system barrel"
```

- [ ] **Step 7: BLUE review and refactor**

Review: only the intended public names are exported, value and type exports are separated, and the barrel stays alphabetically grouped with the existing entries. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: design-system barrel exports (no changes needed)"
```

---

### Task 12: `EditorShell` delegates its layout to `AppFrame` with the sibling slots

**Files:**

- Modify: `editor/shell/editor-shell.tsx`
- Test: `editor/shell/editor-shell.test.tsx` (extend, do not rewrite)

This is the reconciliation task. `EditorShell` keeps ownership of all content (the toolbar children, `ToolsNav`, `PlanView`, `SceneCanvas`, and the `Inspector`). Its outer `<div className="editor-shell">` grid is replaced by `AppFrame`, mapping: toolbar to `header`, `ToolsNav` + the empty floor-switcher slot to `rail`, `PlanView` + the 3D preview to `main`, and the `Inspector` + the two empty paint slots to `inspector`. Every existing landmark and accessible name the current test asserts is preserved.

A subtlety: today the shell renders `ToolsNav` as a `<nav aria-label="Tools">`, and the existing test queries `getByRole('navigation', { name: /tools/i })`. `AppFrame` wraps the rail in an `<aside aria-label="Tools">` (a `complementary` landmark). To keep both the existing navigation assertion and add the new complementary, pass the rail label as `"Tool rail"` so the rail's `complementary` name does not collide with the inner `<nav>`'s `"Tools"` name, and keep `ToolsNav`'s own `<nav aria-label="Tools">` inside the rail. The existing `navigation` assertion then still passes (the inner nav is untouched), and the new `complementary` named "Tool rail" is additive.

- [ ] **Step 1: Write the failing test**

Append to `editor/shell/editor-shell.test.tsx` a new behavior that asserts the frame regions and the empty sibling slots, alongside the existing (still-passing) landmark test:

```tsx
import { FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT } from './shell-panel-slots'

it('lays out the shell in the application frame with empty sibling panel slots', () => {
  vi.stubGlobal('navigator', {})

  renderShell()

  // The frame regions (additive to the existing nav/main/aside landmarks).
  expect(screen.getByRole('complementary', { name: /tool rail/i })).toBeInTheDocument()
  expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()

  // The three cross-track seams render, empty, awaiting the sibling tracks.
  const slotIds = [FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT]
  for (const slotId of slotIds) {
    expect(document.querySelector(`[data-slot-id="${slotId}"]`)).not.toBeNull()
  }

  // The existing nav and inspector landmarks survive the refactor.
  expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
})
```

(The existing tests in this file remain and must still pass; this task adds one behavior and changes no existing assertion.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: FAIL on the new case (no "Tool rail" complementary and no `data-slot-id` nodes yet). The pre-existing cases still pass.

- [ ] **Step 3: Write the minimal implementation**

Modify `editor/shell/editor-shell.tsx`. Import `AppFrame` and `PanelSlot` from `../design-system` and the slot ids from `./shell-panel-slots`. Replace the outer `<div className="editor-shell"> ... </div>` body of `EditorShell` with an `AppFrame`, keeping the providers and all content components exactly as they are. The new `EditorShell` body:

```tsx
import { AppFrame, PanelSlot } from '../design-system'
import { FLOOR_SWITCHER_SLOT, PAINT_PICKER_SLOT, PAINT_INSPECTOR_SLOT } from './shell-panel-slots'

// ... existing imports and helper components unchanged ...

function ShellHeader({ saveStatus, projectControls }: ShellHeaderProps) {
  const graph = useSceneGraph()
  const session = useEditorSession()
  return (
    <div className="editor-shell__toolbar">
      <h1>Vernacular</h1>
      <p aria-live="polite">Walls: {graph.walls.length}</p>
      <p role="status">{SAVE_STATUS_LABELS[saveStatus]}</p>
      <UnitToggle
        units={session.getProject().meta.units}
        onChange={(units) => session.dispatch(setUnits(units))}
      />
      <ProjectControls {...projectControls} />
    </div>
  )
}

export function EditorShell({ saveStatus, recovery, ...projectControls }: EditorShellProps) {
  return (
    <UnderlayProvider>
      <OpeningToolProvider>
        {recovery ? (
          <RecoveryPrompt onRestore={recovery.onRestore} onDiscard={recovery.onDiscard} />
        ) : null}
        <AppFrame
          header={<ShellHeader saveStatus={saveStatus} projectControls={projectControls} />}
          railLabel="Tool rail"
          rail={
            <>
              <ToolsNav />
              <PanelSlot slotId={FLOOR_SWITCHER_SLOT} label="Floors" emptyTitle="Floors" />
            </>
          }
          mainLabel="Viewport"
          main={
            <>
              <PlanView />
              <section className="editor-shell__preview" aria-label="3D preview">
                <SceneCanvas />
              </section>
            </>
          }
          inspectorLabel="Inspector"
          inspector={
            <>
              <Inspector />
              <PanelSlot slotId={PAINT_PICKER_SLOT} label="Paint" emptyTitle="Paint" />
              <PanelSlot
                slotId={PAINT_INSPECTOR_SLOT}
                label="Surface paint"
                emptyTitle="Surface paint"
              />
            </>
          }
        />
      </OpeningToolProvider>
    </UnderlayProvider>
  )
}
```

Notes for the implementer:

- The `role="banner"` now lives on `AppFrame`'s `<header>`, so `ShellHeader` renders a plain `<div className="editor-shell__toolbar">` (no second banner). The existing test queries `getByRole('banner')` and the `<h1>` by role, both of which still resolve through `AppFrame`'s header.
- The `aria-label="Tools"` `<nav>` stays inside `ToolsNav` (unchanged), so the existing `navigation` assertion passes; the rail's own `complementary` is named `"Tool rail"` to avoid a duplicate accessible name.
- `RecoveryPrompt` keeps its `role="alert"`; it now renders just above the frame, which preserves the existing recovery test (it queries by role, not by grid placement).
- Extracting `ShellHeader` keeps `EditorShell` itself under 40 lines.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx`
Expected: PASS (the new slot behavior and every pre-existing landmark and control case).

Also run the app-level test, which renders the full shell, to confirm no regression:

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/shell/editor-shell.tsx editor/shell/editor-shell.test.tsx`
Expected: zero problems. `EditorShell` and `ShellHeader` are each under 40 lines; the file stays under 300 (the existing inspector helpers are unchanged).

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/shell/editor-shell.tsx editor/shell/editor-shell.test.tsx
git commit -m "feat: lay out the editor shell in the application frame with sibling slots"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the content components are reused verbatim (no duplicated markup), the layout is delegated to `AppFrame`, the landmark names are non-colliding, the empty sibling slots use the contract constants, and `EditorShell` stays small via `ShellHeader`. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: shell layout delegation (no changes needed)"
```

---

### Task 13: Migrate the shell stylesheet from hard-coded hex to tokens

**Files:**

- Modify: `editor/shell/editor-shell.css`
- Test: `editor/shell/editor-shell.css.test.ts` (a text-scan test, mirroring the design-system token test pattern)

The old grid moved into `app-frame.css` in Task 12, so the shell stylesheet now only styles the toolbar, tools, inspector chrome, the unit toggle, the recovery prompt, and the plan view. This task replaces every raw hex value with the semantic tokens (the design-system token test proved these names are declared in `tokens.css`, which the provider loads). A text-scan test pins that no raw hex remains, matching how `tokens.test.ts` scans `tokens.css`.

- [ ] **Step 1: Write the failing test**

Create `editor/shell/editor-shell.css.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./editor-shell.css', import.meta.url)), 'utf8')

describe('editor-shell.css', () => {
  it('contains no raw hex color values (uses semantic tokens instead)', () => {
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hex).toEqual([])
  })

  it('references the semantic color tokens', () => {
    expect(css).toContain('var(--color-border)')
    expect(css).toContain('var(--color-text')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run editor/shell/editor-shell.css.test.ts`
Expected: FAIL (the current stylesheet is full of `#1e293b`, `#e2e8f0`, `#0b5394`, and so on).

- [ ] **Step 3: Write the minimal implementation**

Rewrite `editor/shell/editor-shell.css` so every raw value becomes a token reference and the obsolete `.editor-shell` grid block (now owned by `app-frame.css`) is removed. Map each existing hex to its semantic token (these tokens already exist in `tokens.css`): `#1e293b` to `var(--color-text)`, `#475569`/`#64748b` to `var(--color-text-muted)`, `#e2e8f0` to `var(--color-border)`, `#cbd5e1` to `var(--color-border)`, `#f8fafc` to `var(--color-surface-raised)`, `#ffffff` to `var(--color-surface)`, the accents `#1a7fd4`/`#0b5394`/`#1670c9` to `var(--color-accent)`/`var(--color-accent-strong)`. The amber recovery colors (`#f59e0b`, `#fffbeb`) have no semantic token yet; keep them as a documented exception by moving them behind two new local custom properties at the top of the file, since this slice must not edit `tokens.css`:

```css
/*
 * The editor shell chrome (toolbar, tools, inspector edges, unit toggle, recovery
 * prompt, plan view). The frame grid itself lives in app-frame.css. Every color is
 * a semantic design-system token except the recovery-prompt warning pair, which has
 * no semantic token yet and is declared locally here (a documented follow-up for the
 * token set, not a raw value scattered through the rules).
 */

.editor-shell__recovery {
  --shell-warning-border: #f59e0b;
  --shell-warning-surface: #fffbeb;
}
```

(That local declaration is the one place a hex appears; the text-scan test in Step 1 must therefore be amended to exclude the `.editor-shell__recovery` block, OR these two values move to `tokens.css` in a coordinated token-set change. Default: keep them local and have the test allow exactly these two declarations. Adjust the test in Step 1 to assert no hex appears _outside_ the two named warning custom properties, e.g. by filtering out lines containing `--shell-warning-`.) Then restyle the remaining rules with tokens, for example:

```css
.editor-shell__toolbar {
  display: flex;
  align-items: baseline;
  gap: var(--space-5);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}

.editor-shell__inspector {
  border-left: 1px solid var(--color-border);
  padding-left: var(--space-3);
}

.tools-panel button[aria-pressed='true'] {
  border-color: var(--color-accent-strong);
  background: var(--color-accent-strong);
  color: var(--color-surface);
}
```

Keep the unit-toggle, recovery, and plan-view rules but swap their hex for tokens (using the two local warning properties for the recovery border and background).

- [ ] **Step 4: Run the test to verify it passes**

Adjust the Step 1 test to permit only the two `--shell-warning-*` declarations (filter hex matches to those on lines without `--shell-warning-`), then:

Run: `pnpm exec vitest run editor/shell/editor-shell.css.test.ts`
Expected: PASS.

Run the shell and app component tests to confirm the visual structure still renders (jsdom does not compute the cascade, but the class names and structure must be intact):

Run: `pnpm exec vitest run editor/shell/editor-shell.test.tsx app/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint editor/shell/editor-shell.css.test.ts`
Expected: zero problems.

- [ ] **Step 6: Commit (GREEN)**

```bash
git add editor/shell/editor-shell.css editor/shell/editor-shell.css.test.ts
git commit -m "feat: restyle the editor shell chrome with design-system tokens"
```

- [ ] **Step 7: BLUE review and refactor**

Review: no raw hex outside the two documented local warning properties, every color is a semantic token, the obsolete grid block is gone (not commented out), and the WHY comment explains the warning-color exception. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: shell stylesheet tokens (no changes needed)"
```

---

### Task 14: Wrap the editor in `ThemeProvider` at the app root

**Files:**

- Modify: `app/app.tsx`
- Test: `app/app.test.tsx` (add one behavior)

The shell now reads semantic tokens, but those tokens only resolve when the document is inside a `ThemeProvider` (which loads `tokens.css` and sets `data-theme`). Wrapping the editor workspace in the existing `ThemeProvider` makes the whole frame theme-aware end to end. This is the live-app wiring the design-system slice explicitly deferred.

- [ ] **Step 1: Write the failing test**

Add to `app/app.test.tsx` a behavior asserting the rendered app is inside a themed container (the provider sets `data-theme` on its wrapper). Use the existing app render helper / store pattern already in that file:

```tsx
it('renders the editor inside a themed container', async () => {
  // (reuse the file's existing render setup: an in-memory store and waiting for the shell)
  renderApp() // the helper already present in this test file
  // The shell mounts inside the ThemeProvider, which sets data-theme on its wrapper.
  await screen.findByRole('banner')
  expect(document.querySelector('[data-theme]')).not.toBeNull()
})
```

If `app.test.tsx` has no shared `renderApp` helper, mirror the existing top-of-file render pattern (it boots `App` with an `InMemoryProjectStore` and awaits a shell landmark). The single new assertion is that a `[data-theme]` element exists once the shell is mounted.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: FAIL on the new case (no `[data-theme]` wrapper yet); the existing app tests still pass.

- [ ] **Step 3: Write the minimal implementation**

Modify `app/app.tsx`. Import `ThemeProvider` from `../editor/design-system` (the barrel) and wrap the returned tree of `EditorWorkspace` (or the top-level `App` return) so every editor render is themed. The smallest correct change wraps the providers inside `EditorWorkspace`'s return:

```tsx
import { ThemeProvider } from '../editor/design-system'

// ... inside EditorWorkspace's return, wrap the existing provider stack:
return (
  <ThemeProvider>
    <EditorSessionProvider session={session}>
      <AssetCacheProvider assets={assets}>
        <SelectionProvider store={selection}>
          <ActiveToolProvider>
            <EditorShell
              saveStatus={saveStatus}
              recentProjects={recentEntries}
              {...actions}
              {...(recovery ? { recovery } : {})}
            />
          </ActiveToolProvider>
        </SelectionProvider>
      </AssetCacheProvider>
    </EditorSessionProvider>
  </ThemeProvider>
)
```

Import note: `app/` may import `editor/` (the boundary rules allow `app` to import every layer). Import from `../editor/design-system` directly (the design-system barrel), not from `../editor`, since `editor/index.ts` does not re-export the design system.

If the boot status views (`bootStatusView`) should also be themed, wrap the top-level `App` return instead; the minimal slice wraps only the editor workspace, which is sufficient for the test and the deliverable. Record wrapping the loading and error views as a small follow-up if desired.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/app.test.tsx`
Expected: PASS (the new themed-container case and every existing app case).

- [ ] **Step 5: Lint and full check**

Run: `pnpm exec eslint app/app.tsx app/app.test.tsx`
Expected: zero problems.

Then run the full chain to confirm the slice is green end to end:

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all pass. (If `format:check` flags the new files, run `pnpm format` and amend the relevant commit.)

- [ ] **Step 6: Commit (GREEN)**

```bash
git add app/app.tsx app/app.test.tsx
git commit -m "feat: wrap the editor in the theme provider so the frame is theme-aware"
```

- [ ] **Step 7: BLUE review and refactor**

Review: the wrap reuses the existing `ThemeProvider` (no new theming code), the import targets the design-system barrel, the provider order is unchanged inside the theme wrapper, and the change is minimal. Apply fixes or land the empty marker.

```bash
git commit --allow-empty -m "refactor: theme provider wiring (no changes needed)"
```

---

## Coordination and shared-file notes

- **Most tasks are additive under `editor/design-system/`.** Tasks 1 through 11 create only new files there plus the `editor/shell/shell-panel-slots.ts` constants; the only modified shared file is `editor/design-system/index.ts` (Task 11, append-only).
- **The three shared-file edits are Tasks 12, 13, and 14**, each one file: `editor/shell/editor-shell.tsx`, `editor/shell/editor-shell.css`, and `app/app.tsx`. These are the coordination points with any other track touching the shell or the app root. None of these files is touched by the structure or paint tracks for their own content (those tracks mount into the panel slots by id, not by editing the shell), so the only real overlap risk is another user-experience polish slice editing the same three files; sequence this track before any such slice.
- **No `eslint.config.js`, `vite.config.ts`, tsconfig, `.storybook/*`, `package.json`, or lockfile edit.** The design system lives under the already-registered `editor/` boundary and is already a coverage and story root, so the slice needs no config change (the same reasoning the design-system foundation plan recorded).
- **Optional Storybook gallery (not a task here):** a story exercising `AppFrame` collapse, resize, and the empty slots under both themes is a natural addition to `editor/design-system/design-system.stories.tsx` or a new `app-frame.stories.tsx`. It is omitted from the RGB tasks because it is a visual check, not a unit behavior; add it as a follow-up if the team wants the frame in the gallery. It would touch only a new (or the existing) stories file, no config.

---

## File-overlap risk with the structure/multi-floor and paint/metadata tracks

- **Structure and multi-floor track.** Its floor switcher mounts into the `FLOOR_SWITCHER_SLOT` rail seam. The contract is the slot-id constant in `editor/shell/shell-panel-slots.ts`; the structure track imports that constant and renders its switcher into the slot (either by replacing the empty `PanelSlot` in `editor-shell.tsx` with one wrapping its switcher, or by the shell reading a registered panel for that id). **Overlap risk:** both this track and the structure track may want to edit `editor-shell.tsx` (this track to add the empty slot, the structure track to fill it). Mitigation: this track ships the empty slot now, so the structure track's edit is a one-line content swap at a known seam rather than a layout change. Coordinate the single `editor-shell.tsx` line if both land concurrently.
- **Paint and metadata track.** Its color picker, finish picker, and surface paint inspector mount into `PAINT_PICKER_SLOT` and `PAINT_INSPECTOR_SLOT` in the inspector. Same contract and same mitigation: the empty slots ship here; the paint track swaps content at the named seams. **Overlap risk:** the paint track and this track both touch the inspector portion of `editor-shell.tsx`. The existing `Inspector` component (wall/room/opening/dimension editors) is untouched by this track, so the paint track adds beneath it at its slots; coordinate the inspector content region of `editor-shell.tsx` if concurrent.
- **No overlap with the three-dimensional, assets, old-house-vocabulary, or output tracks** in the files this slice edits: those tracks do not touch `editor/shell/editor-shell.tsx`, `editor-shell.css`, `app/app.tsx`, or `editor/design-system/`. The 3D track's only shell contribution (the `SceneCanvas` `<section>`) is carried through unchanged into the frame's `main` slot by Task 12.

---

## Self-review

**Spec and ADR coverage.** ADR-0044 user-experience foundation: "the layout shell" is the in-scope deliverable (Slices 4 and 5); tokens/theming/primitives/empty states are the consumed foundation. Spec section 7.7 (theme via CSS custom properties, system follows `prefers-color-scheme`): satisfied by wrapping in the existing `ThemeProvider` (Task 14), which loads `tokens.css` and resolves the theme. Section 6.13 and 7.9 (semantic UI, ARIA roles and labels, keyboard navigation, `prefers-reduced-motion`): the frame's regions are landmarks with labels (Task 8), collapse uses `aria-expanded` (Task 9), resize uses keyboard-operable `separator`s with `aria-orientation`/`aria-valuenow` (Task 10), and the consumed tokens already honor `prefers-reduced-motion` and `prefers-contrast`. Section 6.6 (a 3D view pane in the frame): the `SceneCanvas` 3D preview region is carried into the frame's `main` slot unchanged (Task 12), so the layout reserves the central area for both the 2D plan and the 3D preview the camera/navigation work renders into.

**Placeholder scan.** Every code step shows complete code; every test step shows the assertion; commands and expected outcomes are explicit. The one place that needs care (the recovery-prompt warning hex with no semantic token) is called out with a concrete default (two local custom properties plus a test filter) rather than left as "handle the colors."

**Type consistency.** `Breakpoint`, `PaneSizeBounds`, `PaneResizeOptions`, `PaneResize`, `PaneCollapse`, `AppFrameProps`, and `PanelSlotProps` are defined where introduced and re-exported by the barrel (Task 11) under the same names used by `EditorShell` (Task 12). `clampPaneSize` is the single clamp consumed by `usePaneResize` (no second clamp). The slot-id constants `FLOOR_SWITCHER_SLOT`, `PAINT_PICKER_SLOT`, `PAINT_INSPECTOR_SLOT` are defined in Task 7 and consumed unchanged in Task 12 and by the sibling tracks.

**Gaps considered.** Pointer-drag resize is implemented (wired through `onResizeTo`) but unit-tested only on the keyboard path, because jsdom has no layout geometry; this matches the project's anti-pattern rule against timing- or geometry-dependent unit tests, and the keyboard path is the accessibility-required behavior. Persisting pane sizes, collapse, and theme to `LibraryStore`, and a theme-switcher UI, are explicitly out of scope and flagged for the settings slice.
