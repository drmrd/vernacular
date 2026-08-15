import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'
import {
  ARRIS_DARK_SCOPE,
  ARRIS_SCOPE,
  blockBodies,
  declarationsIn,
  leafRules,
  resolveColor,
} from './css-token-test-support'

// The active-state doctrine (docs/specs/2026-07-06-arris-visual-design-language.md,
// section 8): a control in an active or selected state renders as a full impression,
// filling with ink and reversing its label to the ground, so state reads without hue.
// `--color-on-surface-active` is the reversed label role, and both languages publish
// it: Draughtsman's Restraint resolves it to the ordinary text ink, Arris to the
// ground behind the fill.
//
// That is why a rule pairing the active fill with a hard-coded `--color-text` looks
// correct under the shipped language and turns illegible under Arris, where the
// active fill IS the text ink. The pairing is the contract, so it is scanned rather
// than trusted, and the reversed pair is measured against the contrast floor in both
// Arris appearances.
//
// Scope: the design system's own stylesheets. Editor and bridge stylesheets that
// paint the same fill are not covered here and are tracked separately; widening the
// scan root is what closes that gap, not a second scanner.

const designSystem = resolve(process.cwd(), 'editor/design-system')
const AA_NORMAL = 4.5

const ACTIVE_FILL = 'var(--color-surface-active)'
const REVERSED_LABEL = 'var(--color-on-surface-active)'
const BACKGROUND_PROPERTIES = ['background', 'background-color', 'background-image']

function cssFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...cssFilesUnder(path))
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(path)
    }
  }
  return files
}

function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim()
}

function paintsActiveFill(body: string): boolean {
  return BACKGROUND_PROPERTIES.some((property) =>
    declaredValue(body, property)?.includes(ACTIVE_FILL),
  )
}

interface StyleRule {
  file: string
  selector: string
  label: string | undefined
  fillsActive: boolean
}

function componentRules(): StyleRule[] {
  const componentStylesheets = cssFilesUnder(designSystem).filter(
    (file) => !file.endsWith('tokens.css') && !file.endsWith('tokens-arris.css'),
  )
  return componentStylesheets.flatMap((file) =>
    leafRules(readFileSync(file, 'utf8')).map((rule) => ({
      file: relative(process.cwd(), file),
      selector: rule.selector,
      label: declaredValue(rule.body, 'color'),
      fillsActive: paintsActiveFill(rule.body),
    })),
  )
}

const PSEUDO_ELEMENT = /::[a-z-]+$/

/**
 * A pseudo-element holds no text, so it cannot carry the reversed label itself.
 * Where the impression is drawn into one, the label rides the originating element,
 * and that is the rule the reversal has to appear on.
 */
function reversesLabel(rule: StyleRule, rules: StyleRule[]): boolean {
  if (rule.label === REVERSED_LABEL) {
    return true
  }
  if (!PSEUDO_ELEMENT.test(rule.selector)) {
    return false
  }
  const originating = rule.selector.replace(PSEUDO_ELEMENT, '').trim()
  return rules.some(
    (candidate) =>
      candidate.file === rule.file &&
      candidate.selector === originating &&
      candidate.label === REVERSED_LABEL,
  )
}

function arrisPalette(appearance: 'light' | 'dark'): Map<string, string> {
  const arrisCss = readFileSync(join(designSystem, 'tokens-arris.css'), 'utf8')
  const light = declarationsIn(blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? '')
  if (appearance === 'light') {
    return light
  }
  const dark = declarationsIn(blockBodies(arrisCss, ARRIS_DARK_SCOPE)[0] ?? '')
  return new Map([...light, ...dark])
}

describe('active-impression label reversal', () => {
  const rules = componentRules()
  const filled = rules.filter((rule) => rule.fillsActive)

  it('finds the active fill in use, so the scan below is not vacuous', () => {
    expect(filled.length).toBeGreaterThan(0)
  })

  it('reverses the label on every design-system rule that fills with the active surface', () => {
    const unreversed = filled.filter((rule) => !reversesLabel(rule, rules))

    const report = unreversed
      .map(({ file, selector, label }) => `${file}: ${selector} { color: ${label ?? '<unset>'} }`)
      .join('\n')

    expect(
      unreversed,
      `A rule that paints ${ACTIVE_FILL} must also declare color: ${REVERSED_LABEL}. ` +
        `Under Arris the active fill is the text ink itself, so a label left at ` +
        `var(--color-text) renders ink on ink and the control becomes a solid ` +
        `unreadable box. Offending rules:\n${report}`,
    ).toEqual([])
  })
})

describe.each(['light', 'dark'] as const)('Arris %s active impression', (appearance) => {
  const vars = arrisPalette(appearance)
  const ratio = (foreground: string, background: string) =>
    contrastRatio(resolveColor(foreground, vars), resolveColor(background, vars))

  it('keeps the reversed label readable on the active fill', () => {
    expect(ratio('--color-on-surface-active', '--color-surface-active')).toBeGreaterThanOrEqual(
      AA_NORMAL,
    )
  })
})
