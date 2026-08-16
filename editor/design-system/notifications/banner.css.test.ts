import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from '../css-token-test-support'

// The banner is the notification tier that does not float: it is a row of the app
// frame, above the canvas rather than over it. That makes it bench, and the bench is
// dead flat and square (the Arris spec, sections 6 and 7). Holding the two tiers apart
// this way is what makes the elevation doctrine legible: the toast is picked up, the
// banner is part of the frame.

const css = readFileSync(
  resolve(process.cwd(), 'editor/design-system/notifications/banner.css'),
  'utf8',
)
const rules = leafRules(css)

function arris(selector: string): string {
  return rules.find((rule) => rule.selector === `${ARRIS_SCOPE} ${selector}`)?.body ?? ''
}

describe('the Arris banner', () => {
  it('is square, because a docked surface is not a picked-up thing', () => {
    expect(arris('.ds-banner')).toContain('border-radius: var(--radius-square)')
  })

  it('stays dead flat', () => {
    const banner = arris('.ds-banner')

    expect(banner).toContain('box-shadow: var(--elevation-flat)')
    expect(
      banner,
      `Only a raised object casts a shadow, and the bench is separated by kerf lines ` +
        `alone (the Arris spec, section 7).`,
    ).not.toContain('var(--elevation-raised)')
  })
})
