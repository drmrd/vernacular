import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'bridge/react/scene-nav-toolbar.css'), 'utf8')

describe('scene-nav-toolbar.css', () => {
  it('contains no raw hex color values, only semantic tokens', () => {
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(hex).toEqual([])
  })

  it('seats the toolbar on the panel surface like the 2D shell chrome', () => {
    expect(css).toMatch(/\.scene-nav-toolbar\b/)
    expect(css).toContain('var(--color-surface-panel)')
    expect(css).toContain('var(--color-border)')
    expect(css).toContain('var(--radius-md)')
  })

  it('marks the active camera mode with the brass indicator token', () => {
    expect(css).toContain('.scene-nav-toolbar__mode')
    expect(css).toContain('var(--color-indicator)')
  })

  it('styles the reset and preset buttons as muted toolbar buttons', () => {
    expect(css).toContain('.scene-nav-toolbar__btn')
    expect(css).toContain('var(--color-text-muted)')
    expect(css).toContain('var(--color-surface-active)')
  })

  it('expresses the grouped tier hierarchy via cluster classes spaced with space tokens', () => {
    expect(css).toContain('.scene-nav-toolbar__primary')
    expect(css).toContain('.scene-nav-toolbar__secondary')
    expect(css).toContain('.scene-nav-toolbar__environment')

    const clusterRules = css.match(
      /\.scene-nav-toolbar__(?:primary|secondary|environment)\b[^{]*\{[^}]*\}/g,
    )
    expect(clusterRules).not.toBeNull()
    const clusterCss = (clusterRules ?? []).join('\n')
    expect(clusterCss).toMatch(/var\(--space-/)
    expect(clusterCss).not.toMatch(/gap:\s*\d/)
  })

  it('lets the toolbar shrink below its content height and scroll internally, so the camera pane below it can keep its min-height share', () => {
    const toolbar = css.match(/\.scene-nav-toolbar\s*\{[^}]*\}/)?.[0] ?? ''

    expect(toolbar).not.toBe('')
    expect(toolbar).toMatch(/min-height:\s*0/)
    expect(toolbar).toMatch(/overflow-y:\s*auto/)
  })

  it('gives the 3D nav buttons and mode pills a 40px minimum target height', () => {
    const btn = css.match(/\.scene-nav-toolbar__btn\s*\{[^}]*\}/)?.[0] ?? ''
    const mode = css.match(/\.scene-nav-toolbar__mode\s*\{[^}]*\}/)?.[0] ?? ''

    expect(btn).not.toBe('')
    expect(mode).not.toBe('')

    expect(btn).toMatch(/min-height:\s*var\(--size-target-min\)/)
    expect(btn).not.toMatch(/height:\s*28px/)

    expect(mode).toMatch(/min-height:\s*var\(--size-target-min\)/)
  })
})

/*
 * Arris hover states brighten a border rather than blooming a glow (the Arris spec,
 * section 8), so the scoped hover rule cancels the fill the shipped language paints.
 * Cancelling a background says nothing about a label, and the declaration that
 * reversed the label onto that fill is still in force at a lower specificity. Left
 * alone, the label keeps reversing to the ground while the ground behind it is that
 * same ground, which reads as an empty control. This is the lesson ADR-0163's
 * addendum ends on: a rule that cancels a fill owes an answer about the label.
 *
 * The design system's cascade scanner cannot catch this one. It resolves the ground
 * from the control's own box or from the impression drawn into its pseudo-element,
 * and a toolbar button that cancels its fill has neither: what shows through is the
 * toolbar surface. So the pairing is asserted here instead.
 *
 * This file reads the stylesheet as text rather than importing a design-system
 * helper, because bridge/ may not import from editor/ (rule 1).
 */

const ARRIS_SCOPE = "[data-design-language='arris']"
const HOVERED_TOGGLE = `${ARRIS_SCOPE} .scene-nav-toolbar__btn:hover:not(:disabled)`

/** The body of the rule opened by exactly this selector, comments stripped. */
function ruleBody(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutComments.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim()
}

describe('the Arris 3D navigation toolbar', () => {
  it('brightens the hovered button border instead of blooming its fill', () => {
    const hover = ruleBody(HOVERED_TOGGLE)

    expect(hover, `no Arris-scoped rule for ${HOVERED_TOGGLE}`).toBeDefined()
    expect(
      declaredValue(hover ?? '', 'background'),
      'hover brightens a border and never blooms a fill (the spec, section 8)',
    ).toBe('transparent')
    expect(declaredValue(hover ?? '', 'border-color')).toBe('var(--color-text)')
  })

  it('restates the label on the rule that cancels the hover fill', () => {
    const hover = ruleBody(HOVERED_TOGGLE) ?? ''

    expect(
      declaredValue(hover, 'color'),
      `The shipped hover rule reverses the label onto the fill it paints. This rule ` +
        `takes the fill away, so it owes an answer about the label: without one the ` +
        `label keeps reversing to the ground it is now sitting on.`,
    ).toBe('var(--color-text)')
  })
})

/*
 * The rule above cancels the hover fill, and it outranks the pressed rule it shares
 * every property with, so on its own it takes the impression away from a toggle that
 * is both pressed and hovered: the ink fill, the indicator border, and the reversed
 * label all go, and an active toggle becomes indistinguishable from an inactive one
 * under the pointer. A declaration read on its own terms cannot show that. These
 * resolve the cascade for a state instead, the way the design system's scanner does,
 * and assert on what actually wins.
 */

/** Specificity as one number, since these selectors carry no ids or element names. */
function specificity(selector: string): number {
  const count = (pattern: RegExp): number => (selector.match(pattern) ?? []).length
  return count(/\.[\w-]+/g) + count(/\[[^\]]*\]/g) + count(/:[a-z-]+(\([^)]*\))?/g)
}

/** Every rule in the stylesheet, in source order. */
function allRules(): { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }))
}

/**
 * The declaration the cascade lands on for a state: the strongest specificity among
 * the rules that apply, and the last one in source order on a tie.
 */
function winning(applying: string[], property: string): string | undefined {
  let winner: string | undefined
  let strongest = -1
  for (const rule of allRules().filter((candidate) => applying.includes(candidate.selector))) {
    const value = declaredValue(rule.body, property)
    if (value !== undefined && specificity(rule.selector) >= strongest) {
      strongest = specificity(rule.selector)
      winner = value
    }
  }
  return winner
}

// Every rule that applies to a toggle which is pressed and hovered at once.
const PRESSED_AND_HOVERED = [
  '.scene-nav-toolbar__btn',
  '.scene-nav-toolbar__btn:hover:not(:disabled)',
  ".scene-nav-toolbar__btn[aria-pressed='true']",
  HOVERED_TOGGLE,
  `${ARRIS_SCOPE} .scene-nav-toolbar__btn[aria-pressed='true']:hover:not(:disabled)`,
]

describe('an Arris toggle that is pressed and hovered at once', () => {
  it('keeps the impression the pressed state paints', () => {
    expect(
      winning(PRESSED_AND_HOVERED, 'background'),
      `The scoped hover rule cancels the fill and outranks the pressed rule, so a ` +
        `pressed toggle under the pointer loses the impression that says it is active.`,
    ).toBe('var(--color-surface-active)')
    expect(winning(PRESSED_AND_HOVERED, 'border-color')).toBe('var(--color-indicator)')
    expect(winning(PRESSED_AND_HOVERED, 'color')).toBe('var(--color-on-surface-active)')
  })
})
