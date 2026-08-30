import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'
import {
  ARRIS_DARK_SCOPE,
  ARRIS_SCOPE,
  blockBodies,
  declarationsIn,
  leafRules,
  resolveColor,
} from '../design-system/css-token-test-support'

const css = readFileSync(resolve(process.cwd(), 'editor/tools/tools-panel.css'), 'utf8')
const arrisTokens = readFileSync(
  resolve(process.cwd(), 'editor/design-system/tokens-arris.css'),
  'utf8',
)

const DRAWN_HEIGHT = 'var(--size-control-height)'
const TARGET_MIN = 'var(--size-target-min)'
const SLOT = 'var(--tools-panel-slot)'
const SCRIBE_WIDTH = 'var(--border-width-scribe)'
// Accent and instrument marks hold 3:1 against their ground (the Arris spec,
// section 5).
const ACCENT_FLOOR = 3

/** A declared value with its formatting collapsed, since the formatter is free to
 * wrap a long one across lines. */
function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
}

/**
 * Whether a selector sizes the chip's own box, which is what carries the hit target.
 * The pseudo-element that draws the slot and the glyph nested inside the chip are
 * both drawn geometry and free to be smaller.
 */
function targetsChipBox(selector: string): boolean {
  const last = selector.trim().split(/\s+/).pop() ?? ''
  return last.startsWith('.tools-panel__chip') && !last.includes('::')
}

/** The Arris palette as one appearance resolves it. */
function arrisPalette(appearance: 'light' | 'dark'): Map<string, string> {
  const light = declarationsIn(blockBodies(arrisTokens, ARRIS_SCOPE)[0] ?? '')
  if (appearance === 'light') {
    return light
  }
  return new Map([...light, ...declarationsIn(blockBodies(arrisTokens, ARRIS_DARK_SCOPE)[0] ?? '')])
}

describe('tools-panel.css', () => {
  it('lays the tool-chip grid out as a single column at the default rail width', () => {
    // The ~11rem default tool rail cannot fit two columns of full-width,
    // left-aligned chips, so long labels (e.g. "Chimney") clip. The default
    // .tools-panel__grid declaration must be a single 1fr column. A wider rail
    // may opt back into two columns inside a min-width media/container query,
    // but the base rule stays single-column.
    const grid = css.match(/\.tools-panel__grid\s*\{[^}]*\}/)?.[0] ?? ''
    expect(grid).not.toBe('')
    expect(grid).toMatch(/grid-template-columns:\s*1fr\s*;/)
    expect(grid).not.toMatch(/grid-template-columns:\s*1fr\s+1fr/)
  })

  it('gives each tool chip a 40px minimum target height', () => {
    // WCAG 2.5.8 (Target Size, Minimum) asks interactive controls to present at
    // least a 40px target on a fine pointer. The tool chips own their own layout
    // and set no height today, so they render ~22 to 24px tall. The chip must
    // route its minimum through the shared --size-target-min token so it tracks
    // the design-system target-size scale (and the coarse-pointer bump) rather
    // than restating a raw pixel value.
    const chip = css.match(/\.tools-panel__chip\s*\{[^}]*\}/)?.[0] ?? ''
    expect(chip).not.toBe('')
    expect(chip).toMatch(/min-height:\s*var\(--size-target-min\)/)
  })
})

// The Arris tool selector is a rack of 32px slots holding 20px icons (the Arris
// spec, section 10). Under ADR-0163 that 32px is paint, not a hit area: the chip's
// own box keeps the 40px target the shipped layer promises, and the slot is drawn
// inside it by a pseudo-element. The rack is the first drawn geometry in the system
// that is larger than the standard 28px control, which is why the slot is clamped:
// on a coarse pointer the drawn control height rises to the 44px touch floor, and a
// slot one grid step above that would spill out of the 44px box carrying it.
describe('the Arris tool rack', () => {
  const rules = leafRules(css)
  const scoped = rules.filter((rule) => rule.selector.includes(ARRIS_SCOPE))
  const slotDeclaration = scoped
    .map((rule) => declaredValue(rule.body, '--tools-panel-slot'))
    .find((value) => value !== undefined)

  it('draws a slot one grid step over the control height, clamped to the hit target', () => {
    expect(slotDeclaration, `no Arris-scoped rule declares --tools-panel-slot`).toBeDefined()

    // 32px: the 28px drawn control plus one 4px base unit (the spec, sections 6 and 10).
    expect(slotDeclaration).toContain(`calc(${DRAWN_HEIGHT} + var(--space-1))`)
    expect(
      slotDeclaration,
      `The slot is paint and the box is the hit-area promise (ADR-0163), so the slot ` +
        `takes the smaller of the two rather than outgrowing the box it is drawn in.`,
    ).toMatch(new RegExp(`^min\\(.*${TARGET_MIN.replace(/[()]/g, '\\$&')}\\s*\\)$`))
  })

  it('draws the slot into a pseudo-element and leaves the chip box at the target', () => {
    const lowered = scoped
      .filter((rule) => targetsChipBox(rule.selector))
      .flatMap((rule) =>
        ['min-height', 'height']
          .map((property) => declaredValue(rule.body, property))
          .filter((value): value is string => value !== undefined && value !== TARGET_MIN)
          .map((value) => `${rule.selector} { ${value} }`),
      )

    expect(
      lowered,
      `An Arris-scoped rule may draw a smaller slot into a pseudo-element, but the ` +
        `chip's own box keeps ${TARGET_MIN} so no slot's hit area reaches into its ` +
        `neighbour's. Rules lowering the box:\n${lowered.join('\n')}`,
    ).toEqual([])

    const impression = scoped.find((rule) => rule.selector.endsWith('.tools-panel__chip::before'))
    expect(impression?.body, 'the impression is drawn from the slot').toContain(SLOT)
  })

  it('sizes the rack glyph from the slot and keeps both out of an unflagged page', () => {
    const glyph = scoped.find((rule) => rule.selector.includes('svg'))
    // 20px: the slot inset by 6px on each side, so the glyph reads as seated in it.
    expect(declaredValue(glyph?.body ?? '', 'width')).toBe(`calc(${SLOT} - var(--space-3))`)

    const unscoped = rules
      .filter((rule) => !rule.selector.includes(ARRIS_SCOPE))
      .filter((rule) => rule.body.includes(DRAWN_HEIGHT) || rule.body.includes(SLOT))
      .map((rule) => rule.selector)

    expect(
      unscoped,
      `${DRAWN_HEIGHT} is a drawn size the shipped language resolves to the target ` +
        `minimum only by coincidence, so every rule reading it stays under ` +
        `${ARRIS_SCOPE} and the flag stays a no-op. Unscoped rules:\n${unscoped.join('\n')}`,
    ).toEqual([])
  })
})

// The active slot of the primary rack carries a 2px Layout Blue scribe line down its
// left edge (the Arris spec, sections 8 and 10). The accent is lawful here because a
// scribe is a line, never a fill (refusal 2), but a line still owes 3:1 against the
// ground it crosses, and the ground the slot offers is the ink fill it marks. The
// accent does not clear the floor there in either appearance, so the rack reserves a
// gutter at the inline start and the scribe is drawn on the bench beside the
// impression rather than on top of it.
describe.each(['light', 'dark'] as const)('the Arris rack scribe, %s', (appearance) => {
  const vars = arrisPalette(appearance)
  const ink = (token: string): string => resolveColor(token, vars)
  const scoped = leafRules(css).filter((rule) => rule.selector.includes(ARRIS_SCOPE))

  it('marks the active slot with an accent line the bench can carry', () => {
    const scribe = scoped.find((rule) =>
      rule.selector.endsWith('.tools-panel__chip.is-active::after'),
    )

    expect(scribe, 'the active slot carries a scribe line').toBeDefined()
    expect(declaredValue(scribe?.body ?? '', 'width')).toBe(SCRIBE_WIDTH)
    expect(declaredValue(scribe?.body ?? '', 'background')).toBe('var(--color-accent)')

    const impression = scoped.find((rule) => rule.selector.endsWith('.tools-panel__chip::before'))
    expect(
      declaredValue(impression?.body ?? '', 'inset-inline'),
      `The impression reserves the scribe's gutter at its inline start, so the accent ` +
        `lands on the bench instead of on the fill it marks.`,
    ).toBe(`${SCRIBE_WIDTH} 0`)

    const onBench = contrastRatio(ink('--color-accent'), ink('--color-surface-panel'))
    const onFill = contrastRatio(ink('--color-accent'), ink('--color-surface-active'))

    expect(
      onBench,
      `the scribe reads against the bench at ${onBench.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(ACCENT_FLOOR)
    expect(
      onFill,
      `The accent measures ${onFill.toFixed(2)}:1 on the active fill, under the 3:1 ` +
        `floor, which is the reason the scribe is drawn beside the impression and ` +
        `not inside it. If this ever clears the floor the gutter can go.`,
    ).toBeLessThan(ACCENT_FLOOR)
  })
})
