import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/plan/opening-inspector.css'), 'utf8')

describe('opening-inspector.css', () => {
  it('gives each opening fraction chip a 40px minimum target height and centers its label', () => {
    // WCAG 2.5.8 (Target Size, Minimum) asks interactive controls to present at
    // least a 40px target on a fine pointer. The inspector preset fraction chips
    // are bespoke and set no height today, so they render ~18px tall. The chip
    // must reserve its minimum through the shared --size-target-min token (so it
    // tracks the design-system target-size scale and the coarse-pointer bump
    // rather than a raw pixel value) and center its label within the taller box.
    const chip = css.match(/\.opening-inspector__fraction-chip\s*\{[^}]*\}/)?.[0] ?? ''
    expect(chip).not.toBe('')
    expect(chip).toMatch(/min-height:\s*var\(--size-target-min\)/)
    expect(chip).toMatch(/align-items:\s*center/)
  })
})
