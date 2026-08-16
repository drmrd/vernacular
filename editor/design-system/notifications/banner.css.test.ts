import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ARRIS_SCOPE,
  arrisRule,
  arrisSelectorsUsing,
  declaredValue,
} from '../css-token-test-support'

// The banner is the notification tier that does not float: it is a row of the app
// frame, above the canvas rather than over it. That makes it bench, and the bench is
// dead flat and square (the Arris spec, sections 6 and 7). Holding the two tiers apart
// this way is what makes the elevation doctrine legible: the toast is picked up, the
// banner is part of the frame.

const css = readFileSync(
  resolve(process.cwd(), 'editor/design-system/notifications/banner.css'),
  'utf8',
)

const ERROR = ".ds-banner[data-severity='error']"
const DANGER = 'var(--color-danger)'

function arris(selector: string): string {
  const found = arrisRule(css, selector)
  expect(found, `banner.css declares no "${ARRIS_SCOPE} ${selector}" rule`).toBeDefined()
  return found ?? ''
}

describe('the Arris banner', () => {
  it('is square, because a docked surface is not a picked-up thing', () => {
    expect(declaredValue(arris('.ds-banner'), 'border-radius')).toBe('var(--radius-square)')
  })

  it('stays dead flat', () => {
    expect(
      declaredValue(arris('.ds-banner'), 'box-shadow'),
      `Only a raised object casts a shadow, and the bench is separated by kerf lines ` +
        `alone (the Arris spec, section 7).`,
    ).toBe('var(--elevation-flat)')
  })
})

// Section 12 states the warning treatment once, for every surface that touches saving,
// storage, import, or export: the words render at full ink and carry a 2px Red Lead
// rule beneath and a Red Lead dot. Red Lead running text below the label floor is
// retired, so the alarm is the rule and the dot while the legibility is the ink.

describe('the Arris custody warning', () => {
  it('renders the words at full ink and puts the alarm in a Red Lead rule', () => {
    const error = arris(ERROR)

    expect(declaredValue(error, 'border-bottom')).toBe(
      `var(--border-width-focus-ring) solid ${DANGER}`,
    )
    expect(
      declaredValue(error, 'color'),
      `Red Lead running text falls below the label floor and is retired, so the words ` +
        `stay at full ink and the rule carries the alarm.`,
    ).toBe('var(--color-text)')
  })

  it('keeps the rest of the frame on the ordinary border', () => {
    expect(
      declaredValue(arris(ERROR), 'border-color'),
      `The unscoped error rule tints all four sides with Red Lead. Undoing that here ` +
        `is what leaves the alarm to the one rule beneath (the Arris spec, section 5).`,
    ).toBe('var(--color-border)')
  })

  it('marks the row with a round Red Lead dot', () => {
    const dot = arris(`${ERROR}::before`)

    expect(declaredValue(dot, 'content')).toBe("''")
    expect(declaredValue(dot, 'background')).toBe(DANGER)
    expect(declaredValue(dot, 'width')).toBe(declaredValue(dot, 'height'))
    expect(
      declaredValue(dot, 'border-radius'),
      `Section 12 asks for a dot. The machined 2px chamfer on a 4px square mark takes ` +
        `the whole side, so the language's own radius token is what rounds it.`,
    ).toBe('var(--radius-sm)')
  })

  it('spends Red Lead on the custody warning and nowhere else', () => {
    expect(
      arrisSelectorsUsing(css, DANGER),
      `Red Lead is destructive and data-loss only, on perhaps one control per screen ` +
        `(the Arris spec, section 5). This fails if a severity picks the color up and ` +
        `if the custody warning drops it, which asking a missing rule to avoid it ` +
        `could never do.`,
    ).toEqual([`${ARRIS_SCOPE} ${ERROR}`, `${ARRIS_SCOPE} ${ERROR}::before`])
  })
})

// Layout Blue exists as lines and glyphs in an enumerated set of roles, and nothing
// else borrows it (the Arris spec, section 5). A notification's action is a word the
// user has to read and act on, which puts it in the 7:1 body tier rather than the 3:1
// accent tier, so it is stamped plainly in ink. The dismiss control keeps the
// secondary tier, since its meaning survives on position and its label.

describe('the Arris notification action', () => {
  it('stamps the action label in ink rather than borrowing the accent', () => {
    expect(declaredValue(arris('.ds-banner__action'), 'color')).toBe('var(--color-text)')
  })

  it('holds the dismiss control at the secondary tier', () => {
    expect(declaredValue(arris('.ds-banner__dismiss'), 'color')).toBe('var(--color-ink-secondary)')
  })
})
