import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from './css-token-test-support'

// jsdom applies no stylesheets, so the panel's Arris structure is read out of the
// CSS as text, the idiom the design system's other guards already use.
const css = readFileSync(resolve(process.cwd(), 'editor/design-system/panel-slot.css'), 'utf8')
const rules = leafRules(css)

/** The body of the rule opened by exactly this selector, or ''. */
function bodyOf(selector: string): string {
  return rules.find((rule) => rule.selector.replace(/\s+/g, ' ') === selector)?.body ?? ''
}

// Panels breathe through structure rather than whitespace (the Arris spec, section
// 6). Related controls cluster on the 4px grid, and one section is told from the next
// by a single kerf line, a 1px cut at 20 percent ink, with 12px of air on each side
// of it. No card, no second background, no tonal patchwork.
describe('panel-slot.css under Arris', () => {
  it('clusters a section on the 8px gutter', () => {
    const slot = bodyOf(`${ARRIS_SCOPE} .ds-panel-slot`)
    expect(slot, 'no Arris-scoped rule reaches the panel slot').not.toBe('')
    expect(slot).toMatch(/gap:\s*var\(--space-2\)/)
  })

  it('cuts a kerf line between one section and the next', () => {
    const between = bodyOf(`${ARRIS_SCOPE} .ds-panel-slot + .ds-panel-slot`)
    expect(between, 'nothing separates two adjacent sections').not.toBe('')
    expect(between).toMatch(
      /border-top:\s*var\(--border-width-resting\)\s+solid\s+var\(--color-kerf\)/,
    )
    expect(between).toMatch(/margin-top:\s*var\(--space-3\)/)
    expect(between).toMatch(/padding-top:\s*var\(--space-3\)/)
  })

  it('never draws the kerf line above the first section of a panel', () => {
    // A leading rule would put a cut against the panel's own top edge, where there
    // is nothing to separate. The adjacent-sibling combinator is what rules that
    // out, so the separation may not be expressed as a plain rule on every slot.
    const everySlot = bodyOf(`${ARRIS_SCOPE} .ds-panel-slot`)
    expect(everySlot, 'no Arris-scoped rule reaches the panel slot').not.toBe('')
    expect(everySlot).not.toMatch(/border-top:/)
  })

  it('keeps the section structure behind the preview flag', () => {
    const unscoped = rules
      .filter(
        (rule) => /var\(--color-kerf\)/.test(rule.body) && !rule.selector.includes(ARRIS_SCOPE),
      )
      .map((rule) => rule.selector)

    expect(
      unscoped,
      `The kerf line is Arris's form of separation, so every rule that draws one must ` +
        `sit under ${ARRIS_SCOPE}. Unscoped rules:\n${unscoped.join('\n')}`,
    ).toEqual([])
  })
})
