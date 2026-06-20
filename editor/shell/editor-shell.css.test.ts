import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/editor-shell.css'), 'utf8')

describe('editor-shell.css', () => {
  it('contains no raw hex color values outside the documented warning properties', () => {
    const hex =
      css
        .split('\n')
        .filter((line) => !line.includes('--shell-warning-'))
        .join('\n')
        .match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hex).toEqual([])
  })

  it('references the semantic color tokens', () => {
    expect(css).toContain('var(--color-border)')
    expect(css).toContain('var(--color-text')
  })

  it('uses --color-on-accent not --color-surface for text on accent-strong fills', () => {
    // brass-600 (--color-accent-strong) gives only 4.41:1 against vellum-100
    // (--color-surface), which falls short of WCAG AA 4.5:1 for normal text.
    // Any rule that sets background: --color-accent-strong must pair it with
    // color: --color-on-accent (vellum-50, 4.72:1) not --color-surface.
    expect(css).not.toMatch(
      /background:\s*var\(--color-accent-strong\)[^}]*\bcolor:\s*var\(--color-surface\)/,
    )
  })

  it('no longer defines the retired icon-button and zoom-percent idiom selectors', () => {
    // The header icon buttons and the zoom control route through the design-system
    // IconButton primitive, so the hand-rolled idiom selectors move out of the shell
    // CSS. The .editor-shell__zoom group wrapper may remain.
    expect(css).not.toMatch(/\.editor-shell__icon-btn\b/)
    expect(css).not.toMatch(/\.editor-shell__icon-btn--labeled\b/)
    expect(css).not.toMatch(/\.editor-shell__zoom-percent\b/)
  })

  it('renders the wordmark in the heading font on the extended type scale', () => {
    // ADR-0069 keeps the "Vernacular" wordmark in EB Garamond (the heading
    // family) and on the extended type scale, not the UI family at a raw 1rem.
    const wordmark = css.match(/\.editor-shell__wordmark\s*\{[^}]*\}/)?.[0] ?? ''
    expect(wordmark).not.toBe('')
    expect(wordmark).toContain('var(--font-family-heading)')
    expect(wordmark).toMatch(/font-size:\s*var\(--font-size-/)
    expect(wordmark).not.toMatch(/font-size:\s*1rem/)
  })

  it('lets the header toolbar and actions cluster wrap so they never overflow', () => {
    // Below the 1024px wide breakpoint the header (brand + project menu +
    // breadcrumb + the Grid/Dimensions/zoom/undo/redo/theme/Export/Save actions
    // cluster + the save-status span) is a single non-wrapping flex row whose
    // intrinsic min-width exceeds the viewport, so Export/Save clip off the right
    // edge and the frame is forced wider than the viewport (sideways scroll).
    // Letting both the toolbar and its actions cluster wrap reflows the header to
    // multiple rows, collapsing its intrinsic min-width to the widest single item.
    const toolbar = css.match(/\.editor-shell__toolbar\s*\{[^}]*\}/)?.[0] ?? ''
    expect(toolbar).not.toBe('')
    expect(toolbar).toMatch(/flex-wrap:\s*wrap/)

    const actions = css.match(/\.editor-shell__toolbar-actions\s*\{[^}]*\}/)?.[0] ?? ''
    expect(actions).not.toBe('')
    expect(actions).toMatch(/flex-wrap:\s*wrap/)
  })

  it('reserves a steady footprint for the header save-status indicator', () => {
    // The header save-status indicator cycles through labels of very different
    // widths ("Ready", "Saving...", "All changes saved", "Save failed"). As a
    // flex item in .editor-shell__toolbar it sizes to its current label, so the
    // element resizes and the surrounding header chrome shifts as the autosave
    // state changes. The .editor-shell__save-status rule must reserve a steady
    // box: a min-width declaration wide enough for the longest label keeps the
    // element from growing or shrinking as the state changes. The exact min-width
    // value is the implementer's call.
    const block = css.match(/\.editor-shell__save-status\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).not.toBe('')
    expect(block).toMatch(/min-width:/)
  })
})
