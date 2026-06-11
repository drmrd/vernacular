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

describe('drafting-table type and elevation tokens', () => {
  it('registers the heading, mono, and elevation tokens', () => {
    const names = tokenList.map((entry) => entry.name)
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
