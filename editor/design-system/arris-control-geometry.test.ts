import { readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { ARRIS_SCOPE, leafRules } from './css-token-test-support'

// Arris draws a 28px control (the Arris spec, section 6) while ADR-0112 promises a
// 40px hit target on a fine pointer, rising to 44px on a coarse one. Those are two
// different measurements of the same control, and this is where they are reconciled:
// the layout box keeps the target, so no control's hit area reaches into its
// neighbour's, and the impression is drawn inside it from `--size-control-height`.
//
// Two properties make that safe. The drawn-height token never reaches a page without
// the flag, because every rule that reads it is scoped under the Arris attribute. And
// no scoped rule shrinks the layout box, because the hit-area promise is not the
// design language's to lower.

const designSystem = resolve(process.cwd(), 'editor/design-system')

// The control families this slice migrates. Each draws its impression from the
// drawn-height token and keeps its layout box on the target-size token.
const CONTROL_STYLESHEETS = ['button.css', 'icon-button.css', 'segmented.css', 'field.css']

const DRAWN_HEIGHT = 'var(--size-control-height)'
const TARGET_MIN = 'var(--size-target-min)'
const BOX_HEIGHT_PROPERTIES = ['min-height', 'height']

function rulesIn(stylesheet: string) {
  return leafRules(readFileSync(join(designSystem, stylesheet), 'utf8')).map((rule) => ({
    ...rule,
    stylesheet,
  }))
}

const controlRules = CONTROL_STYLESHEETS.flatMap(rulesIn)

function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim()
}

function boxHeights(body: string): string[] {
  return BOX_HEIGHT_PROPERTIES.map((property) => declaredValue(body, property)).filter(
    (value): value is string => value !== undefined,
  )
}

const isArrisScoped = (selector: string): boolean => selector.includes(ARRIS_SCOPE)

describe('Arris drawn control height', () => {
  it('draws every migrated control family from the drawn-height token', () => {
    const withoutDrawnHeight = CONTROL_STYLESHEETS.filter(
      (stylesheet) =>
        !rulesIn(stylesheet).some(
          (rule) => isArrisScoped(rule.selector) && rule.body.includes(DRAWN_HEIGHT),
        ),
    )

    expect(
      withoutDrawnHeight,
      `Each migrated control family needs an Arris-scoped rule that draws its ` +
        `impression from ${DRAWN_HEIGHT}. Stylesheets with none:\n` +
        withoutDrawnHeight.join('\n'),
    ).toEqual([])
  })

  it('keeps the drawn-height token out of the rendering a page without the flag gets', () => {
    const unscoped = controlRules.filter(
      (rule) => rule.body.includes(DRAWN_HEIGHT) && !isArrisScoped(rule.selector),
    )

    const report = unscoped.map((rule) => `${rule.stylesheet}: ${rule.selector}`).join('\n')

    expect(
      unscoped,
      `${DRAWN_HEIGHT} is a drawn size, not a hit-area promise, and the shipped ` +
        `language resolves it to the target minimum only by coincidence. Every rule ` +
        `that reads it must sit under ${ARRIS_SCOPE} so the flag stays a no-op. ` +
        `Unscoped rules:\n${report}`,
    ).toEqual([])
  })

  it('never lets the design language shrink a box the shipped layer holds at the target', () => {
    const shrunk = controlRules
      .filter(isControlBoxRule)
      .filter((rule) => promisedTargets.has(baseSelector(rule.selector)))
      .flatMap((rule) =>
        boxHeights(rule.body)
          .filter((value) => value !== TARGET_MIN)
          .map((value) => `${rule.stylesheet}: ${rule.selector} { ${value} }`),
      )

    expect(
      shrunk,
      `An Arris-scoped rule may draw a smaller impression, but where the shipped ` +
        `layer reserves ${TARGET_MIN} the control's own box keeps it, so its hit ` +
        `area never overlaps a neighbour's. A control the shipped layer never held ` +
        `at the target (a text field) is free to size its own box. Rules lowering a ` +
        `promised target:\n${shrunk.join('\n')}`,
    ).toEqual([])
  })
})

/** The selector with the Arris scope stripped, so a scoped rule can be paired with the rule it retunes. */
function baseSelector(selector: string): string {
  return selector.replace(ARRIS_SCOPE, '').trim()
}

function isControlBoxRule(rule: { selector: string }): boolean {
  // A pseudo-element draws the impression and is not the control's own box.
  return isArrisScoped(rule.selector) && !rule.selector.includes('::')
}

/** Selectors the shipped layer holds at the ADR-0112 target minimum. */
const promisedTargets = new Set(
  controlRules
    .filter((rule) => !isArrisScoped(rule.selector))
    .filter((rule) => boxHeights(rule.body).includes(TARGET_MIN))
    .map((rule) => rule.selector),
)

describe('the coarse-pointer floor', () => {
  const arrisTokens = readFileSync(join(designSystem, 'tokens-arris.css'), 'utf8')

  it('collapses the drawn control onto the touch target where a finger has to hit it', () => {
    const coarse = leafRules(arrisTokens).filter(
      (rule) => isArrisScoped(rule.selector) && rule.body.includes('--size-control-height'),
    )

    expect(coarse.length).toBeGreaterThan(0)
    const raised = coarse.some((rule) =>
      /--size-control-height:\s*var\(--size-target-min-touch\)/.test(rule.body),
    )
    expect(
      raised,
      'On a coarse pointer the drawn control rises to the touch floor, because a ' +
        '28px control centred in a 44px hit area invites a press that looks like a miss.',
    ).toBe(true)
  })
})

describe('the migrated stylesheets', () => {
  it('names only stylesheets that exist', () => {
    for (const stylesheet of CONTROL_STYLESHEETS) {
      expect(basename(stylesheet)).toBe(stylesheet)
      expect(() => readFileSync(join(designSystem, stylesheet), 'utf8')).not.toThrow()
    }
  })
})
