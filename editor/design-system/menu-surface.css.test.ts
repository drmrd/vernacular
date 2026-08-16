import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, blockBodies, declarationsIn, leafRules } from './css-token-test-support'

// Arris publishes two elevation tiers and no third (the Arris spec, section 7). The
// bench is dead flat, and only a thing the user has physically picked up casts a
// shadow: 0 2px 8px at 25 percent black, over a 1px border. An open menu is such a
// thing, and so is every dropdown in the shell that still draws its own chrome rather
// than borrowing the shared surface.
//
// Each of those surfaces reaches for --elevation-overlay today, a role the Arris token
// layer happens to alias onto the raised tier. Aliasing is not the doctrine. The rule
// the spec states is that a picked-up thing casts the raised tier, so each surface says
// so under the Arris scope and this reads it back.
//
// The square rule in section 7 is written for what is docked. A surface the user
// summoned and dismisses with Escape is not docked, so it keeps the machined 2px
// chamfer the language gives everything else.

const RAISED_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.25)'
const RAISED_TIER = 'var(--elevation-raised)'
const RESTING_BORDER = 'var(--border-width-resting)'
const CHAMFER = 'var(--radius-sm)'
const SQUARE = 'var(--radius-square)'

const RAISED_SURFACES = [
  { stylesheet: 'editor/design-system/menu-surface.css', selector: '.ds-menu-surface' },
  { stylesheet: 'editor/shell/project-menu.css', selector: '.project-menu__list' },
  { stylesheet: 'editor/shell/export-menu.css', selector: '.export-menu__list' },
]

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function arrisRuleBody(stylesheet: string, selector: string): string | undefined {
  return leafRules(read(stylesheet)).find((rule) => rule.selector === `${ARRIS_SCOPE} ${selector}`)
    ?.body
}

describe('the Arris raised object', () => {
  it('resolves the raised tier to the one shadow the language allows', () => {
    const arris = blockBodies(read('editor/design-system/tokens-arris.css'), ARRIS_SCOPE)[0] ?? ''
    expect(declarationsIn(arris).get('--elevation-raised')).toBe(RAISED_SHADOW)
  })

  it.each(RAISED_SURFACES)('casts the raised tier on $selector', ({ stylesheet, selector }) => {
    const body = arrisRuleBody(stylesheet, selector)

    expect(
      body,
      `${stylesheet} declares no "${ARRIS_SCOPE} ${selector}" rule. A picked-up thing ` +
        `casts the raised tier by name, rather than trusting an overlay role that only ` +
        `happens to alias it in this language.`,
    ).toBeDefined()
    expect(body).toContain(`box-shadow: ${RAISED_TIER}`)
    expect(body).toContain(`border-width: ${RESTING_BORDER}`)
  })

  it.each(RAISED_SURFACES)('keeps the chamfer on $selector', ({ stylesheet, selector }) => {
    const body = arrisRuleBody(stylesheet, selector) ?? ''

    expect(body).toContain(`border-radius: ${CHAMFER}`)
    expect(
      body,
      `${selector} is summoned and leaves on Escape, so it is not one of the docked ` +
        `surfaces section 7 squares off.`,
    ).not.toContain(SQUARE)
  })
})

// A row on this surface is a design-system button, so the Arris button family draws an
// impression behind it into a pseudo-element (ADR-0163): a bordered box of the raised
// material. A menu is a stack of rows cut from one piece rather than a column of
// separate tools, so the resting row keeps the material and drops the border, and hover
// brings the border back instead of blooming a fill (the Arris spec, section 8).

const ROW = '.ds-menu-surface__row'
const MENU_SURFACE = 'editor/design-system/menu-surface.css'

function arrisRow(state: string): string {
  return arrisRuleBody(MENU_SURFACE, `${ROW}${state}`) ?? ''
}

describe('the Arris menu row', () => {
  it('drops the impression border while keeping the surface material under it', () => {
    const resting = arrisRow('::before')

    expect(resting).toContain('border-color: transparent')
    expect(
      resting,
      `The row's ground is the surface it sits on. Naming it here is what lets the ` +
        `cascade scanner measure the label against the ground it really lands on.`,
    ).toContain('background: var(--color-surface-raised)')
  })

  it('cancels the hover fill and restates the label the cancelled fill had reversed', () => {
    const hover = arrisRow(':hover')

    expect(hover).toContain('background: transparent')
    expect(
      hover,
      `A rule that cancels a fill owes an answer about the label, because the ` +
        `declaration that reversed it is still in force at a lower specificity ` +
        `(the ADR-0163 addendum).`,
    ).toContain('color: var(--color-text)')
  })

  it('brightens the border on hover instead', () => {
    const hover = arrisRow(':hover::before')

    expect(hover).toContain('border-width: var(--border-width-active)')
    expect(hover).toContain('border-color: var(--color-border)')
  })

  it('seats that border with the one duration and the one easing curve', () => {
    expect(
      arrisRow('::before'),
      `Section 8 allows 90ms with cubic-bezier(0.2, 0, 0, 1), a seat rather than a ` +
        `bounce, and the Arris token layer zeroes the duration under reduced motion.`,
    ).toContain('transition: border-color var(--motion-duration) var(--motion-easing)')
  })

  it('leaves the row box at the hit target it inherits', () => {
    const boxes = [arrisRow(''), arrisRow(':hover')].join('\n')

    expect(
      /(?:^|;)\s*(?:min-)?height\s*:/.test(boxes),
      `The impression shrinks to the drawn height; the row's own box keeps the ` +
        `ADR-0112 target it gets from the button family, so a menu row's hit area ` +
        `never reaches into its neighbour's.`,
    ).toBe(false)
  })
})
