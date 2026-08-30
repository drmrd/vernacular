import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ARRIS_SCOPE,
  arrisRule,
  arrisSelectorsUsing,
  declaredValue,
} from '../css-token-test-support'

// A toast is pinned over the canvas, which is exactly what refusal 4 refuses: nothing
// floats over the canvas uninvited. The refusal carves out one exception, a thing the
// user summoned that leaves on Escape, and reads it back as a picked-up thing under
// section 7. A toast is not that, so while the tier exists it is at least held to the
// raised-object doctrine: the one shadow, a 1px border, the machined chamfer, and the
// raised material rather than the bench it is not sitting on.
//
// It also stops sliding in. Nothing moves unless the user moved it (principle 5), and
// nobody moved a toast.

const css = readFileSync(
  resolve(process.cwd(), 'editor/design-system/notifications/toast.css'),
  'utf8',
)

const ERROR = ".ds-toast[data-severity='error']"
const DANGER = 'var(--color-danger)'

function arris(selector: string): string {
  const found = arrisRule(css, selector)
  expect(found, `toast.css declares no "${ARRIS_SCOPE} ${selector}" rule`).toBeDefined()
  return found ?? ''
}

describe('the Arris toast', () => {
  it('carries the raised-object surface', () => {
    const toast = arris('.ds-toast')

    expect(declaredValue(toast, 'box-shadow')).toBe('var(--elevation-raised)')
    expect(declaredValue(toast, 'border-radius')).toBe('var(--radius-sm)')
    expect(
      declaredValue(toast, 'background'),
      `A picked-up thing is not the bench, so it takes the raised material rather ` +
        `than the panel surface it borrows today.`,
    ).toBe('var(--color-surface-raised)')
  })

  it('retires the severity stripe for the one resting border', () => {
    expect(
      declaredValue(arris('.ds-toast'), 'border-left'),
      `The 4px left stripe codes severity by hue. Layout Blue is lines and glyphs in ` +
        `an enumerated set that does not include a severity stripe, and Red Lead is ` +
        `destructive and data-loss only (the Arris spec, section 5).`,
    ).toBe('var(--border-width-resting) solid var(--color-border)')
  })

  it('does not slide in', () => {
    expect(
      declaredValue(arris('.ds-toast'), 'animation'),
      `Nothing moves unless the user moved it (principle 5), and an arriving toast ` +
        `is the one thing on screen the user did not touch.`,
    ).toBe('none')
  })
})

// The custody doctrine is stated once and every surface that touches saving, storage,
// import, or export obeys it (the Arris spec, section 12), so the toast carries the
// same alarm the banner does: full-ink words, a 2px Red Lead rule beneath, a Red Lead
// dot, and nothing else borrowing the color.

describe('the Arris toast custody warning', () => {
  it('renders the words at full ink and puts the alarm in a Red Lead rule', () => {
    const error = arris(ERROR)

    expect(declaredValue(error, 'border-bottom')).toBe(
      `var(--border-width-focus-ring) solid ${DANGER}`,
    )
    expect(declaredValue(error, 'color')).toBe('var(--color-text)')
  })

  it('marks the toast with a round Red Lead dot', () => {
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

describe('the Arris toast action', () => {
  it('stamps the action label in ink rather than borrowing the accent', () => {
    expect(declaredValue(arris('.ds-toast__action'), 'color')).toBe('var(--color-text)')
  })

  it('holds the dismiss control at the secondary tier', () => {
    expect(declaredValue(arris('.ds-toast__dismiss'), 'color')).toBe('var(--color-ink-secondary)')
  })
})
