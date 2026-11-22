import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/design-system/button.css'), 'utf8')

describe('button.css', () => {
  it('dims a button marked aria-disabled the same as a natively disabled one', () => {
    // A button that stays focusable but is unavailable (Swap sash sides on a
    // hung window) uses aria-disabled instead of the native attribute. It must
    // share the disabled look: not-allowed cursor and 0.6 opacity.
    const dimmingRule = css.match(/[^{}]*\[aria-disabled='true'\][^{}]*\{[^}]*\}/)?.[0] ?? ''
    expect(dimmingRule).not.toBe('')
    expect(dimmingRule).toMatch(/\.ds-button\[aria-disabled='true'\]/)
    expect(dimmingRule).toMatch(/cursor:\s*not-allowed/)
    expect(dimmingRule).toMatch(/opacity:\s*0\.6/)
  })

  it('skips the Arris hover effect on a button marked aria-disabled', () => {
    const hoverRule = css.match(/[^{}]*:hover:not\([^{}]*\{[^}]*\}/)?.[0] ?? ''
    expect(hoverRule).not.toBe('')
    expect(hoverRule).toContain(":not([aria-disabled='true'])")
  })

  it('skips the Arris press effect on a button marked aria-disabled', () => {
    const pressRule = css.match(/[^{}]*:active:not\([^{}]*\{[^}]*\}/)?.[0] ?? ''
    expect(pressRule).not.toBe('')
    expect(pressRule).toContain(":not([aria-disabled='true'])")
  })
})
