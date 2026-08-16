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
