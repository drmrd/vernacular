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
})
