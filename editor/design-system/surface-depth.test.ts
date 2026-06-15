import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { tokenList } from './tokens'

const tokensCss = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')
const appFrameCss = readFileSync(
  resolve(process.cwd(), 'editor/design-system/app-frame.css'),
  'utf8',
)

// The light-theme declarations live in the first :root block; it holds only flat
// custom-property declarations, so the first closing brace ends it.
function rootDeclarations(source: string): Map<string, string> {
  const fromRoot = source.slice(source.indexOf(':root'))
  const block = fromRoot.slice(fromRoot.indexOf('{') + 1, fromRoot.indexOf('}'))
  const declarations = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value.trim())
    }
  }
  return declarations
}

// Follow a token through any var() aliases to its primitive value, or '' if undefined.
function resolveToken(name: string, declarations: Map<string, string>): string {
  const value = declarations.get(name)
  if (value === undefined) {
    return ''
  }
  const referenced = value.match(/^var\((--[\w-]+)\)$/)?.[1]
  return referenced !== undefined ? resolveToken(referenced, declarations) : value
}

// The body of the rule a selector opens at its first occurrence (no nested braces).
function ruleBody(source: string, selector: string): string {
  const open = source.indexOf('{', source.indexOf(selector))
  return source.slice(open + 1, source.indexOf('}', open))
}

describe('surface depth', () => {
  const light = rootDeclarations(tokensCss)

  it('maps the canvas, panel, and raised surfaces to three distinct warm tones', () => {
    const canvas = resolveToken('--color-surface', light)
    const panel = resolveToken('--color-surface-panel', light)
    const raised = resolveToken('--color-surface-raised', light)
    expect(canvas).not.toBe('')
    expect(panel).not.toBe('')
    expect(raised).not.toBe('')
    expect(new Set([canvas, panel, raised]).size).toBe(3)
  })

  it('registers the panel surface in the token registry', () => {
    const names = tokenList.map((entry) => entry.name)
    expect(names).toContain('--color-surface-panel')
  })

  it('seats the rail and inspector panes on the deeper panel surface', () => {
    expect(ruleBody(appFrameCss, '.ds-app-frame__rail {')).toContain('var(--color-surface-panel)')
    expect(ruleBody(appFrameCss, '.ds-app-frame__inspector {')).toContain(
      'var(--color-surface-panel)',
    )
  })
})
