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
})
