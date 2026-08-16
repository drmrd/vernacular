import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'
import {
  ARRIS_DARK_SCOPE,
  ARRIS_SCOPE,
  blockBodies,
  compareSpecificity,
  declarationsIn,
  leafRules,
  resolveColor,
  specificity,
  type CssRule,
} from './css-token-test-support'

// Pairing a fill with a reversed label inside one rule is not enough on its own. The
// cascade can take the two apart: a higher-specificity rule may cancel the fill
// without saying anything about the label, and the label then keeps a reversal meant
// for a fill that is no longer painted. That is exactly what the Arris hover rule did
// to the icon button, where the label reversed to the ground and the impression
// behind it was that same ground.
//
// So this measures the outcome rather than the declarations: for each control state,
// resolve which `color` and which background actually win under the Arris scope, then
// check the winning label against the ground it really sits on. Where the control's
// own box paints nothing, the ground is the impression drawn into its pseudo-element.

const designSystem = resolve(process.cwd(), 'editor/design-system')

// A probe names a design-system stylesheet by bare file name and anything else by its
// repo-relative path, so the scan reaches the consumer stylesheets outside this
// directory that paint the same fills (ADR-0163 left those uncovered, issue #551).
const stylesheetPath = (name: string) =>
  name.includes('/') ? resolve(process.cwd(), name) : join(designSystem, name)

const AA_NORMAL = 4.5
const IMPRESSION = '::before'
const NO_PAINT = new Set(['transparent', 'none'])

interface Probe {
  name: string
  stylesheet: string
  base: string
  state: string
}

const PROBES: Probe[] = [
  {
    name: 'icon button, hovered',
    stylesheet: 'icon-button.css',
    base: '.ds-icon-button',
    state: ':hover',
  },
  {
    name: 'icon button, pressed',
    stylesheet: 'icon-button.css',
    base: '.ds-icon-button',
    state: "[aria-pressed='true']",
  },
  {
    name: 'segmented option, active',
    stylesheet: 'segmented.css',
    base: '.ds-segmented__option',
    state: '.is-active',
  },
  {
    name: 'push button, hovered',
    stylesheet: 'button.css',
    base: '.ds-button',
    state: ':hover',
  },
  {
    name: 'menu surface row, hovered',
    stylesheet: 'menu-surface.css',
    base: '.ds-menu-surface__row',
    state: ':hover',
  },
  {
    name: 'project menu row, hovered',
    stylesheet: 'editor/shell/project-menu.css',
    base: '.project-menu__row',
    state: ':hover',
  },
  {
    name: 'export menu row, hovered',
    stylesheet: 'editor/shell/export-menu.css',
    base: '.export-menu__row',
    state: ':hover',
  },
  {
    name: 'banner, custody warning',
    stylesheet: 'editor/design-system/notifications/banner.css',
    base: '.ds-banner',
    state: "[data-severity='error']",
  },
  {
    name: 'toast, custody warning',
    stylesheet: 'editor/design-system/notifications/toast.css',
    base: '.ds-toast',
    state: "[data-severity='error']",
  },
]

function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim()
}

/** The selector with the Arris scope stripped, since every rule applies under it. */
function withoutScope(selector: string): string {
  return selector.startsWith(ARRIS_SCOPE) ? selector.slice(ARRIS_SCOPE.length).trim() : selector
}

function rulesMatching(rules: CssRule[], probe: Probe, pseudoElement: string): CssRule[] {
  const wanted = new Set([
    `${probe.base}${pseudoElement}`,
    `${probe.base}${probe.state}${pseudoElement}`,
  ])
  return rules.filter((rule) => wanted.has(withoutScope(rule.selector)))
}

/** The declaration the cascade lands on: strongest specificity, last one on a tie. */
function winning(rules: CssRule[], property: string): string | undefined {
  let winner: string | undefined
  let strongest: [number, number, number] = [-1, -1, -1]
  for (const rule of rules) {
    const value = declaredValue(rule.body, property)
    if (value !== undefined && compareSpecificity(specificity(rule.selector), strongest) >= 0) {
      strongest = specificity(rule.selector)
      winner = value
    }
  }
  return winner
}

function arrisPalette(appearance: 'light' | 'dark'): Map<string, string> {
  const arrisCss = readFileSync(stylesheetPath('tokens-arris.css'), 'utf8')
  const light = declarationsIn(blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? '')
  if (appearance === 'light') {
    return light
  }
  return new Map([...light, ...declarationsIn(blockBodies(arrisCss, ARRIS_DARK_SCOPE)[0] ?? '')])
}

function toColor(value: string, vars: Map<string, string>): string {
  const token = value.match(/var\((--[\w-]+)\)/)?.[1]
  return token !== undefined ? resolveColor(token, vars) : value.trim()
}

describe.each(['light', 'dark'] as const)('Arris %s effective label', (appearance) => {
  const vars = arrisPalette(appearance)

  it.each(PROBES)('keeps the $name label readable on the ground it lands on', (probe) => {
    const rules = leafRules(readFileSync(stylesheetPath(probe.stylesheet), 'utf8'))

    const label = winning(rulesMatching(rules, probe, ''), 'color')
    const boxFill = winning(rulesMatching(rules, probe, ''), 'background')
    const impression = winning(rulesMatching(rules, probe, IMPRESSION), 'background')

    expect(label, `no color wins for ${probe.base}${probe.state}`).toBeDefined()

    // A box painting nothing shows the impression drawn behind its label instead.
    const groundValue = boxFill !== undefined && !NO_PAINT.has(boxFill) ? boxFill : impression
    expect(groundValue, `no ground resolves for ${probe.base}${probe.state}`).toBeDefined()

    const ratio = contrastRatio(toColor(label ?? '', vars), toColor(groundValue ?? '', vars))

    expect(
      ratio,
      `${probe.name}: the cascade lands on color ${label} over ${groundValue}, which ` +
        `resolves to ${toColor(label ?? '', vars)} on ${toColor(groundValue ?? '', vars)} ` +
        `(${ratio.toFixed(2)}:1). A rule that cancels a fill has to say what the label ` +
        `does too, or the label keeps a reversal meant for a fill nobody paints.`,
    ).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})
