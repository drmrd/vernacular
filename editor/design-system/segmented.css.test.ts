import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/segmented.css'), 'utf8')

describe('segmented.css', () => {
  it('reserves the 40px target minimum on each segmented option and centers its label', () => {
    // The theme and unit toggles both render the bare Segmented primitive, so
    // their option box is whatever .ds-segmented__option is. At ~22px tall it
    // falls below the WCAG 2.5.8 target-size minimum. The base option rule must
    // reserve the target minimum (routed through --size-target-min, not a raw
    // literal) and center the label within the taller box.
    const option = css.match(/\.ds-segmented__option\s*\{[^}]*\}/)?.[0] ?? ''
    expect(option).not.toBe('')
    expect(option).toMatch(/min-height:\s*var\(--size-target-min\)/)
    expect(option).toMatch(/align-items:\s*center/)
  })
})
