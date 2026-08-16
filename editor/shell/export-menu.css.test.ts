import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from '../design-system/css-token-test-support'

// The export menu is the other consumer surface ADR-0163 left illegible under the
// preview (issue #551), and it carries a second line of text per row. A hovered row
// that fills with ink hides the label and the description both, since the description
// sits at the secondary tier and has even less room to spare.

const css = readFileSync(resolve(process.cwd(), 'editor/shell/export-menu.css'), 'utf8')
const rules = leafRules(css)

function body(selector: string): string {
  return rules.find((rule) => rule.selector === selector)?.body ?? ''
}

function arris(selector: string): string {
  return body(`${ARRIS_SCOPE} ${selector}`)
}

describe('the export menu row', () => {
  it('pairs its hover fill with the reversed label role', () => {
    const hover = body('.export-menu__row:hover')

    expect(hover).toContain('background: var(--color-surface-active)')
    expect(
      hover,
      `Under Arris the active fill is the text ink, so a label left on the ordinary ` +
        `ink renders a solid unreadable row.`,
    ).toContain('color: var(--color-on-surface-active)')
  })

  it('drops the impression border under Arris and keeps the surface material', () => {
    const resting = arris('.export-menu__row::before')

    expect(resting).toContain('border-color: transparent')
    expect(resting).toContain('background: var(--color-surface-raised)')
  })

  it('cancels the Arris hover fill and restates the label with it', () => {
    const hover = arris('.export-menu__row:hover')

    expect(hover).toContain('background: transparent')
    expect(hover).toContain('color: var(--color-text)')
  })

  it('brightens the row border on hover instead', () => {
    const hover = arris('.export-menu__row:hover::before')

    expect(hover).toContain('border-width: var(--border-width-active)')
    expect(hover).toContain('border-color: var(--color-border)')
  })

  it('leaves the row box at the hit target it inherits', () => {
    const boxes = [arris('.export-menu__row'), arris('.export-menu__row:hover')].join('\n')

    expect(
      /(?:^|;)\s*(?:min-)?height\s*:/.test(boxes),
      `A menu row's own box keeps the ADR-0112 target it gets from the button family, ` +
        `so its hit area never reaches into its neighbour's.`,
    ).toBe(false)
  })
})
