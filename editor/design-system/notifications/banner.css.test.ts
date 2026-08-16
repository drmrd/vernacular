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

// Section 12 states the warning treatment once, for every surface that touches saving,
// storage, import, or export: the words render at full ink and carry a 2px Red Lead
// rule beneath and a Red Lead dot. Red Lead running text below the label floor is
// retired, so the alarm is the rule and the dot while the legibility is the ink.

const CUSTODY_RULE = 'border-bottom: var(--border-width-focus-ring) solid var(--color-danger)'

describe('the Arris custody warning', () => {
  it('renders the words at full ink and puts the alarm in a Red Lead rule', () => {
    const error = arris(".ds-banner[data-severity='error']")

    expect(error).toContain(CUSTODY_RULE)
    expect(
      error,
      `Red Lead running text falls below the label floor and is retired, so the words ` +
        `stay at full ink and the rule carries the alarm.`,
    ).toContain('color: var(--color-text)')
  })

  it('keeps the rest of the frame on the ordinary border', () => {
    expect(
      arris(".ds-banner[data-severity='error']"),
      `Red Lead appears on perhaps one control per screen (the Arris spec, section 5), ` +
        `so it draws the one rule rather than tinting the whole box.`,
    ).toContain('border-color: var(--color-border)')
  })

  it('marks the row with a Red Lead dot', () => {
    const dot = arris(".ds-banner[data-severity='error']::before")

    expect(dot).toContain("content: ''")
    expect(dot).toContain('background: var(--color-danger)')
    expect(
      dot,
      `Nothing is ever a pill (refusal 7), so the dot is a small machined square ` +
        `rather than a rounded capsule.`,
    ).toContain('border-radius: var(--radius-sm)')
  })

  it('holds the warning severity off Red Lead', () => {
    expect(
      arris(".ds-banner[data-severity='warning']"),
      `Red Lead is destructive and data-loss only (the Arris spec, section 5), so a ` +
        `warning cannot borrow the custody alarm.`,
    ).not.toContain('var(--color-danger)')
  })
})

// Layout Blue exists as lines and glyphs in an enumerated set of roles, and nothing
// else borrows it (the Arris spec, section 5). A notification's action is a word the
// user has to read and act on, which puts it in the 7:1 body tier rather than the 3:1
// accent tier, so it is stamped plainly in ink. The dismiss control keeps the
// secondary tier, since its meaning survives on position and its label.

describe('the Arris notification action', () => {
  it('stamps the action label in ink rather than borrowing the accent', () => {
    const action = arris('.ds-banner__action')

    expect(action).toContain('color: var(--color-text)')
    expect(action).not.toContain('var(--color-accent)')
  })

  it('holds the dismiss control at the secondary tier', () => {
    expect(arris('.ds-banner__dismiss')).toContain('color: var(--color-ink-secondary)')
  })
})
