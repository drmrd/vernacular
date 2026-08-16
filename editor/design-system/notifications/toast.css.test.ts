import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from '../css-token-test-support'

// A toast is pinned over the canvas, which is exactly what refusal 4 refuses: nothing
// floats over the canvas uninvited. The refusal carves out one exception, a thing the
// user summoned that leaves on Escape, and reads it back as a picked-up thing under
// section 7. A toast is not that, so while the tier exists it is at least held to the
// raised-object doctrine: the one shadow, a 1px border, the machined chamfer, and the
// raised material rather than the bench it is not sitting on.
//
// It also stops sliding in. Nothing moves unless the user moved it (principle 5), and
// nobody moved a toast.

const css = readFileSync(
  resolve(process.cwd(), 'editor/design-system/notifications/toast.css'),
  'utf8',
)
const rules = leafRules(css)

function arris(selector: string): string {
  return rules.find((rule) => rule.selector === `${ARRIS_SCOPE} ${selector}`)?.body ?? ''
}

describe('the Arris toast', () => {
  it('carries the raised-object surface', () => {
    const toast = arris('.ds-toast')

    expect(toast).toContain('box-shadow: var(--elevation-raised)')
    expect(toast).toContain('border-radius: var(--radius-sm)')
    expect(
      toast,
      `A picked-up thing is not the bench, so it takes the raised material rather ` +
        `than the panel surface it borrows today.`,
    ).toContain('background: var(--color-surface-raised)')
  })

  it('retires the severity stripe for the one resting border', () => {
    const toast = arris('.ds-toast')

    expect(
      toast,
      `The 4px left stripe codes severity by hue. Layout Blue is lines and glyphs in ` +
        `an enumerated set that does not include a severity stripe, and Red Lead is ` +
        `destructive and data-loss only (the Arris spec, section 5).`,
    ).toContain('border-left: var(--border-width-resting) solid var(--color-border)')
  })

  it('does not slide in', () => {
    expect(
      arris('.ds-toast'),
      `Nothing moves unless the user moved it (principle 5), and an arriving toast ` +
        `is the one thing on screen the user did not touch.`,
    ).toContain('animation: none')
  })
})
