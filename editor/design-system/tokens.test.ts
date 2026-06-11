import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { tokens, tokenList } from './tokens'

const tokensCss = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

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
