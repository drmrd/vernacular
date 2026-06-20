import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { tokens, tokenList } from './tokens'

const tokensCss = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

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

describe('extended spacing scale', () => {
  it('registers --space-6 and --space-7 in the token registry', () => {
    const names = tokenList.map((entry) => entry.name)
    expect(names).toContain('--space-6')
    expect(names).toContain('--space-7')
  })

  it('declares --space-6 and --space-7 in tokens.css', () => {
    expect(tokensCss).toContain('--space-6:')
    expect(tokensCss).toContain('--space-7:')
  })

  it('exposes var() accessors for the new spacing tokens', () => {
    expect(tokens.space6.variable).toBe('var(--space-6)')
    expect(tokens.space7.variable).toBe('var(--space-7)')
  })
})

describe('extended type scale', () => {
  it('registers --font-size-xs and --font-size-xl in the token registry', () => {
    const names = tokenList.map((entry) => entry.name)
    expect(names).toContain('--font-size-xs')
    expect(names).toContain('--font-size-xl')
  })

  it('declares --font-size-xs and --font-size-xl in tokens.css', () => {
    expect(tokensCss).toContain('--font-size-xs:')
    expect(tokensCss).toContain('--font-size-xl:')
  })

  it('exposes var() accessors for the new type-scale tokens', () => {
    expect(tokens.fontSizeXs.variable).toBe('var(--font-size-xs)')
    expect(tokens.fontSizeXl.variable).toBe('var(--font-size-xl)')
  })
})

describe('dead system-theme block', () => {
  it('drops the unreachable data-theme="system" selector', () => {
    expect(tokensCss).not.toContain("data-theme='system'")
    expect(tokensCss).not.toContain('data-theme="system"')
  })

  it('keeps the real dark-theme assignments', () => {
    expect(tokensCss).toContain("[data-theme='dark']")
    expect(tokensCss).toMatch(/\[data-theme='dark'\][^}]*--color-surface:\s*var\(--ink-950\)/)
  })

  it('overrides the active-surface fill in the dark block so it does not inherit the light vellum', () => {
    const darkBlock = tokensCss.match(/\[data-theme='dark'\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(darkBlock).toMatch(/--color-surface-active:\s*var\(--ink-800\)/)
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

  it('includes brass-600 as the primary button-fill primitive', () => {
    expect(tokensCss).toContain('#8b692a')
  })

  it('assigns the light-mode accent-strong token to the brass-600 primitive', () => {
    expect(tokensCss).toMatch(/--color-accent-strong:\s*var\(--brass-600\)/)
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

  it('registers the surface-active and indicator semantic tokens', () => {
    const names = tokenList.map((t) => t.name)
    expect(names).toContain('--color-surface-active')
    expect(names).toContain('--color-indicator')
  })

  it('leads the heading stack with EB Garamond for cross-platform serif consistency', () => {
    expect(tokensCss).toMatch(/--font-family-heading:\s*'EB Garamond'/)
  })

  it('leads the ui stack with Inter for cross-platform sans consistency', () => {
    expect(tokensCss).toMatch(/--font-family-ui:\s*'Inter'/)
  })
})

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

describe('WCAG target-size tokens (issue #234)', () => {
  it('declares the fine-pointer 40px target minimum', () => {
    expect(tokensCss).toMatch(/--size-target-min:\s*2\.5rem/)
  })

  it('declares the coarse-pointer 44px touch minimum', () => {
    expect(tokensCss).toMatch(/--size-target-min-touch:\s*2\.75rem/)
  })

  it('retokenizes the icon square onto the fine-pointer minimum', () => {
    expect(tokensCss).toMatch(/--size-control-icon:\s*var\(--size-target-min\)/)
  })

  it('drops the old icon-square placeholder literal', () => {
    expect(tokensCss).not.toMatch(/--size-control-icon:\s*1\.75rem/)
  })

  it('bumps the target minimum to the touch value on a coarse pointer', () => {
    expect(tokensCss).toMatch(
      /@media \(pointer: coarse\)[^}]*--size-target-min:\s*var\(--size-target-min-touch\)/s,
    )
  })

  it('registers the two new target-size tokens', () => {
    expect(tokenList.map((t) => t.name)).toEqual(
      expect.arrayContaining(['--size-target-min', '--size-target-min-touch']),
    )
  })

  it('exposes var() accessors for the new target-size tokens', () => {
    expect(tokens.sizeTargetMin.variable).toBe('var(--size-target-min)')
    expect(tokens.sizeTargetMinTouch.variable).toBe('var(--size-target-min-touch)')
  })
})
