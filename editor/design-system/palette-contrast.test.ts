import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { contrastRatio } from '../../core'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

const AA_NORMAL = 4.5
const AA_UI = 3

function declarationsIn(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim())
    }
  }
  return map
}

function blockBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  const open = source.indexOf('{', start)
  // Assumes the target block has no nested braces: it takes the first '}'
  // after the selector's '{' as the block's end (true for flat token blocks).
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

function resolveColor(name: string, vars: Map<string, string>): string {
  const value = vars.get(name) ?? name
  const captured = value.match(/var\((--[\w-]+)\)/)?.[1]
  return captured !== undefined ? resolveColor(captured, vars) : value
}

function paletteFor(theme: 'light' | 'dark'): Map<string, string> {
  const root = declarationsIn(blockBody(css, ':root'))
  if (theme === 'light') {
    return root
  }
  const dark = declarationsIn(blockBody(css, "[data-theme='dark']"))
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

  it('keeps the strong accent usable as text on the surface', () => {
    expect(ratio('--color-accent-strong', '--color-surface')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps on-accent label text readable on the strong accent fill', () => {
    expect(ratio('--color-on-accent', '--color-accent-strong')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('keeps the focus ring visible against the surface', () => {
    expect(ratio('--color-focus-ring', '--color-surface')).toBeGreaterThanOrEqual(AA_UI)
  })
})
