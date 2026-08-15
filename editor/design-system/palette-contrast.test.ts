import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { contrastRatio } from '../../core'
import { blockBodies, declarationsIn, resolveColor } from './css-token-test-support'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

const AA_NORMAL = 4.5
const AA_UI = 3

const blockBody = (selector: string): string => blockBodies(css, selector)[0] ?? ''

function paletteFor(theme: 'light' | 'dark'): Map<string, string> {
  const root = declarationsIn(blockBody(':root'))
  if (theme === 'light') {
    return root
  }
  const dark = declarationsIn(blockBody("[data-theme='dark']"))
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

  it('keeps the primary button fill distinct from the surface', () => {
    expect(ratio('--color-accent-strong', '--color-surface')).toBeGreaterThanOrEqual(AA_UI)
  })

  it('keeps on-accent label text readable on the strong accent fill', () => {
    expect(ratio('--color-on-accent', '--color-accent-strong')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the focus ring visible against the surface', () => {
    expect(ratio('--color-focus-ring', '--color-surface')).toBeGreaterThanOrEqual(AA_UI)
  })

  it('keeps active-state label text readable on the active fill', () => {
    expect(ratio('--color-text', '--color-surface-active')).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})
