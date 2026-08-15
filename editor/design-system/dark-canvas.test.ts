import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'
import { blockBodies, declarationsIn, resolveColor } from './css-token-test-support'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/tokens.css'), 'utf8')

const blockBody = (selector: string): string => blockBodies(css, selector)[0] ?? ''

const root = declarationsIn(blockBody(':root'))
const dark = new Map([...root, ...declarationsIn(blockBody("[data-theme='dark']"))])

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

  it('keeps the wall poche a solid mass distinct from the room fill in both themes', () => {
    expect(lightness('--color-canvas-poche', root)).toBeLessThan(
      lightness('--color-canvas-room-fill', root),
    )
    expect(lightness('--color-canvas-poche', dark)).toBeGreaterThan(
      lightness('--color-canvas-room-fill', dark),
    )
    expect(resolveColor('--color-canvas-poche', dark)).not.toBe(
      resolveColor('--color-canvas-poche', root),
    )
  })
})
