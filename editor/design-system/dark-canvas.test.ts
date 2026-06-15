import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

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

// The body of a selector's rule (no nested braces), taking the first '{' after the
// selector through the next '}'.
function blockBody(source: string, selector: string): string {
  const open = source.indexOf('{', source.indexOf(selector))
  return source.slice(open + 1, source.indexOf('}', open))
}

function resolveColor(name: string, vars: Map<string, string>): string {
  const value = vars.get(name) ?? name
  const captured = value.match(/var\((--[\w-]+)\)/)?.[1]
  return captured !== undefined ? resolveColor(captured, vars) : value
}

const root = declarationsIn(blockBody(css, ':root'))
const dark = new Map([...root, ...declarationsIn(blockBody(css, "[data-theme='dark']"))])

// A color's relative lightness, read as its contrast against black: a lighter color
// contrasts more with black than a darker one does.
const lightness = (name: string, vars: Map<string, string>): number =>
  contrastRatio(resolveColor(name, vars), '#000000')

describe('dark canvas palette', () => {
  it('inverts the canvas walls to a light poche in dark mode', () => {
    expect(lightness('--color-canvas-wall', dark)).toBeGreaterThan(
      lightness('--color-canvas-wall', root),
    )
  })

  it('darkens the canvas room fill in dark mode', () => {
    expect(lightness('--color-canvas-room-fill', dark)).toBeLessThan(
      lightness('--color-canvas-room-fill', root),
    )
  })

  it('retunes the grid and ruler band for the dark canvas', () => {
    expect(resolveColor('--color-canvas-grid', dark)).not.toBe(
      resolveColor('--color-canvas-grid', root),
    )
    expect(resolveColor('--color-canvas-ruler-band', dark)).not.toBe(
      resolveColor('--color-canvas-ruler-band', root),
    )
  })
})
