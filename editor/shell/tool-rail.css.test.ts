import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { declaredValue, leafRules } from '../design-system/css-token-test-support'

// jsdom applies no stylesheets, so the rail's section structure is read out of the
// CSS as text, the idiom the design system's other guards already use.
const css = readFileSync(resolve(process.cwd(), 'editor/shell/tool-rail.css'), 'utf8')

/** The body of the rule opened by exactly this selector, or ''. */
function bodyOf(selector: string): string {
  return leafRules(css).find((rule) => rule.selector === selector)?.body ?? ''
}

// Sections are told apart by a kerf line rather than by cards, tones, or shadows
// (ADR-0165). The rail's Edit-layer section sits below the Tools section, so it
// carries the kerf on its own top edge, with the same margin-and-padding air the
// design system's other section separators use.
describe('tool-rail.css', () => {
  it('separates the edit-layer section from the tools section with a kerf line', () => {
    const editLayer = bodyOf('.tool-rail__edit-layer')
    expect(editLayer, 'no rule declares .tool-rail__edit-layer').not.toBe('')
    expect(declaredValue(editLayer, 'margin-top')).toBe('var(--space-6)')
    expect(declaredValue(editLayer, 'padding-top')).toBe('var(--space-3)')
    expect(declaredValue(editLayer, 'border-top')).toBe(
      'var(--border-width-resting) solid var(--color-kerf)',
    )
  })
})
