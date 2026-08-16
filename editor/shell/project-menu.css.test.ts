import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ARRIS_SCOPE,
  arrisRule,
  declaredValue,
  leafRules,
  scopedBoxHeights,
} from '../design-system/css-token-test-support'

// The project menu is one of the consumer surfaces ADR-0163 left illegible under the
// preview (issue #551): its hovered row paints the active fill and says nothing about
// the label, which is correct under the shipped language and ink on ink under Arris,
// where the active fill is the text ink itself.
//
// The fix has three parts. The unscoped rule pairs the fill with the reversed label
// role, which resolves to the ordinary ink under the shipped language and so changes
// nothing there. The Arris rule cancels the fill, because hover brightens a border and
// never blooms one (the Arris spec, section 8). And it restates the label, because the
// reversal above is still in force at a lower specificity (the ADR-0163 addendum).

const css = readFileSync(resolve(process.cwd(), 'editor/shell/project-menu.css'), 'utf8')

function body(selector: string): string {
  const found = leafRules(css).find((rule) => rule.selector === selector)?.body
  expect(found, `project-menu.css declares no "${selector}" rule`).toBeDefined()
  return found ?? ''
}

function arris(selector: string): string {
  const found = arrisRule(css, selector)
  expect(found, `project-menu.css declares no "${ARRIS_SCOPE} ${selector}" rule`).toBeDefined()
  return found ?? ''
}

describe('the project menu row', () => {
  it('pairs its hover fill with the reversed label role', () => {
    const hover = body('.project-menu__row:hover')

    expect(declaredValue(hover, 'background')).toBe('var(--color-surface-active)')
    expect(
      declaredValue(hover, 'color'),
      `Under Arris the active fill is the text ink, so a label left on the ordinary ` +
        `ink renders a solid unreadable row.`,
    ).toBe('var(--color-on-surface-active)')
  })

  it('drops the impression border under Arris and keeps the surface material', () => {
    const resting = arris('.project-menu__row::before')

    expect(declaredValue(resting, 'border-color')).toBe('transparent')
    expect(declaredValue(resting, 'background')).toBe('var(--color-surface-raised)')
  })

  it('cancels the Arris hover fill and restates the label with it', () => {
    const hover = arris('.project-menu__row:hover')

    expect(declaredValue(hover, 'background')).toBe('transparent')
    expect(declaredValue(hover, 'color')).toBe('var(--color-text)')
  })

  it('brightens the row border on hover instead', () => {
    expect(declaredValue(arris('.project-menu__row:hover::before'), 'border-color')).toBe(
      'var(--color-border)',
    )
  })

  it('keeps the chevron trigger borderless under Arris', () => {
    const trigger = arris('.project-menu__trigger-shape::before')

    expect(
      declaredValue(trigger, 'border-color'),
      `The trigger is deliberately slim and borderless. The Arris icon button draws ` +
        `its impression into a pseudo-element, which would hand this trigger the ` +
        `bordered box the idiom does without.`,
    ).toBe('transparent')
    expect(declaredValue(trigger, 'background')).toBe('transparent')
  })

  it('leaves every scoped row box at the hit target it inherits', () => {
    expect(
      scopedBoxHeights(css),
      `A menu row's own box keeps the ADR-0112 target it gets from the button family, ` +
        `so its hit area never reaches into its neighbour's.`,
    ).toEqual([])
  })
})
