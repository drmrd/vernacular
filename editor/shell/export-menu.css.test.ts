import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ARRIS_SCOPE,
  arrisRule,
  compareSpecificity,
  declaredValue,
  leafRules,
  scopedBoxHeights,
  specificity,
} from '../design-system/css-token-test-support'

// The export menu is the other consumer surface ADR-0163 left illegible under the
// preview (issue #551), and it carries a second line of text per row. A hovered row
// that fills with ink hides the label and the description both, since the description
// sits at the secondary tier and has even less room to spare.

const css = readFileSync(resolve(process.cwd(), 'editor/shell/export-menu.css'), 'utf8')

function body(selector: string): string {
  const found = leafRules(css).find((rule) => rule.selector === selector)?.body
  expect(found, `export-menu.css declares no "${selector}" rule`).toBeDefined()
  return found ?? ''
}

function arris(selector: string): string {
  const found = arrisRule(css, selector)
  expect(found, `export-menu.css declares no "${ARRIS_SCOPE} ${selector}" rule`).toBeDefined()
  return found ?? ''
}

// A disabled row must not brighten. The button family guards its own hover bump with
// :not(:disabled) at a specificity these row rules do not reach, so a row rule that
// restates the border for every :hover is the only rule left standing over a disabled
// row, and the row would light up under a pointer that cannot use it. Mirroring the
// guard puts the two rules on equal footing and lets the disabled row stay quiet.

describe('the export menu row', () => {
  it('pairs its hover fill with the reversed label role', () => {
    const hover = body('.export-menu__row:hover')

    expect(declaredValue(hover, 'background')).toBe('var(--color-surface-active)')
    expect(
      declaredValue(hover, 'color'),
      `Under Arris the active fill is the text ink, so a label left on the ordinary ` +
        `ink renders a solid unreadable row.`,
    ).toBe('var(--color-on-surface-active)')
  })

  it('drops the impression border under Arris and keeps the surface material', () => {
    const resting = arris('.export-menu__row::before')

    expect(declaredValue(resting, 'border-color')).toBe('transparent')
    expect(declaredValue(resting, 'background')).toBe('var(--color-surface-raised)')
  })

  it('cancels the Arris hover fill and restates the label with it', () => {
    const hover = arris('.export-menu__row:hover')

    expect(declaredValue(hover, 'background')).toBe('transparent')
    expect(declaredValue(hover, 'color')).toBe('var(--color-text)')
  })

  it('brightens the row border on hover instead, and only where the row is usable', () => {
    const hover = arris('.export-menu__row:hover:not(:disabled)::before')

    expect(declaredValue(hover, 'border-color')).toBe('var(--color-border)')
    expect(declaredValue(hover, 'border-width')).toBe('var(--border-width-active)')
  })

  it('leaves every scoped row box at the hit target it inherits', () => {
    expect(
      scopedBoxHeights(css),
      `A menu row's own box keeps the ADR-0112 target it gets from the button family, ` +
        `so its hit area never reaches into its neighbour's.`,
    ).toEqual([])
  })

  it("spans the impression across the row's own full box, not the button family's drawn-control band", () => {
    const buttonCss = readFileSync(
      resolve(process.cwd(), 'editor/design-system/button.css'),
      'utf8',
    )
    const buttonImpression = arrisRule(buttonCss, '.ds-button::before')
    expect(
      buttonImpression,
      `button.css declares no "${ARRIS_SCOPE} .ds-button::before" rule`,
    ).toBeDefined()

    const rowImpression = arris('.export-menu__row::before')

    // The row wears both .ds-button and .export-menu__row, so both Arris-scoped
    // ::before rules reach the same element and tie on specificity. Every consumer
    // imports the design system before its own stylesheet, so the row's rule should
    // win that tie: it comes later in cascade order.
    const candidates: Array<{ selector: string; body: string }> = [
      { selector: `${ARRIS_SCOPE} .ds-button::before`, body: buttonImpression ?? '' },
      { selector: `${ARRIS_SCOPE} .export-menu__row::before`, body: rowImpression },
    ]

    let winner: string | undefined
    let strongest: [number, number, number] = [-1, -1, -1]
    for (const candidate of candidates) {
      const value = declaredValue(candidate.body, 'inset-block')
      const rank = specificity(candidate.selector)
      if (value !== undefined && compareSpecificity(rank, strongest) >= 0) {
        strongest = rank
        winner = value
      }
    }

    expect(
      winner,
      `ADR-0166: a menu row is cut from the surface it sits on, not a control band ` +
        `stacked on top of it. An export-menu row carries two lines of text, a title and ` +
        `a wrapped description, so its impression has to describe the row's own full box ` +
        `(inset-block: 0) rather than the drawn-control band button.css centers at ` +
        `calc((100% - var(--size-control-height)) / 2). The cascade lands on ${winner ?? 'nothing'}.`,
    ).toBe('0')
  })
})
