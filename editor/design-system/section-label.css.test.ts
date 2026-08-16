import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from './css-token-test-support'

// jsdom applies no stylesheets, so the section header's Arris treatment is read out
// of the CSS as text, the idiom the design system's other guards already use.
const css = readFileSync(resolve(process.cwd(), 'editor/design-system/section-label.css'), 'utf8')
const rules = leafRules(css)

/** The body of the rule opened by exactly this selector, or ''. */
function bodyOf(selector: string): string {
  return rules.find((rule) => rule.selector.replace(/\s+/g, ' ') === selector)?.body ?? ''
}

// A section header in Arris is stamped rather than written (the Arris spec, sections
// 4, 5 and 10): the interface face at 600 and 11px, uppercase and tracked, at the 80
// percent ink tier the ramp names for stamped labels. It sits in a band of the drawn
// control height, so a header reads as a row of the panel rather than as a line of
// text that happens to be small.
describe('section-label.css under Arris', () => {
  const stamped = bodyOf(`${ARRIS_SCOPE} .ds-section-label`)

  it('stamps the header at the ink ramp tier that names section headers', () => {
    expect(stamped, 'no Arris-scoped rule reaches the section label').not.toBe('')
    expect(stamped).toMatch(/color:\s*var\(--color-ink-label\)/)
  })

  it('sets the header at the stamped weight, size and tracking', () => {
    expect(stamped).toMatch(/font-weight:\s*var\(--font-weight-semibold\)/)
    expect(stamped).toMatch(/font-size:\s*var\(--font-size-xs\)/)
    expect(stamped).toMatch(/letter-spacing:\s*var\(--letter-spacing-stamped\)/)
  })

  it('gives the header a band to sit in rather than leaving it inline', () => {
    expect(stamped).toMatch(/min-height:\s*var\(--size-control-height\)/)
    expect(stamped).toMatch(/align-items:\s*center/)
  })

  it('keeps the stamped treatment behind the preview flag', () => {
    const stampedTokens =
      /var\(--(color-ink-label|letter-spacing-stamped|size-control-height|line-height-panel)\)/
    const unscoped = rules
      .filter((rule) => stampedTokens.test(rule.body) && !rule.selector.includes(ARRIS_SCOPE))
      .map((rule) => rule.selector)

    expect(
      unscoped,
      `The stamped treatment is Arris's, so every rule that reads one of its tokens ` +
        `must sit under ${ARRIS_SCOPE} and a page without the flag renders as before. ` +
        `Unscoped rules:\n${unscoped.join('\n')}`,
    ).toEqual([])
  })
})
