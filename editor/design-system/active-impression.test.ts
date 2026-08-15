import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

import { contrastRatio } from '../../core'

// The active-state doctrine (ADR-0154 section 8): a control in an active or selected
// state renders as a full impression, filling with ink and reversing its label to the
// ground, so state reads without hue. `--color-on-surface-active` is the reversed
// label role, and both languages publish it: Draughtsman's Restraint resolves it to
// the ordinary text ink, Arris to the ground behind the fill.
//
// That is why a rule pairing the active fill with a hard-coded `--color-text` looks
// correct under the shipped language and turns illegible under Arris, where the
// active fill IS the text ink. The pairing is the contract, so it is scanned rather
// than trusted, and the reversed pair is measured against the contrast floor in both
// Arris appearances.

const designSystem = resolve(process.cwd(), 'editor/design-system')
const ARRIS_SCOPE = "[data-design-language='arris']"
const ARRIS_DARK_SCOPE = `${ARRIS_SCOPE}[data-theme='dark']`
const AA_NORMAL = 4.5

const ACTIVE_FILL = 'var(--color-surface-active)'
const REVERSED_LABEL = 'var(--color-on-surface-active)'

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

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

interface Rule {
  selector: string
  body: string
}

/**
 * Leaf rules only: a block whose body declares properties rather than nesting more
 * blocks, so an `@media` wrapper contributes its inner rules and not itself.
 */
function leafRules(css: string): Rule[] {
  const rules: Rule[] = []
  const source = stripComments(css)
  let selectorStart = 0
  let depth = 0
  let blockStart = 0
  let selector = ''
  const closeBlock = (index: number): void => {
    const body = source.slice(blockStart, index)
    if (!body.includes('{')) {
      rules.push({ selector, body })
    }
    selectorStart = index + 1
  }
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') {
      if (depth === 0) {
        selector = source.slice(selectorStart, index).trim()
        blockStart = index + 1
      }
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        closeBlock(index)
      }
    }
  }
  return rules
}

function declaredValue(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return match?.[1]?.trim()
}

/** Rules whose background (longhand or shorthand) paints the active-state fill. */
function activeFillRules(): { file: string; selector: string; label?: string }[] {
  const componentStylesheets = cssFilesUnder(designSystem).filter(
    (file) => !file.endsWith('tokens.css') && !file.endsWith('tokens-arris.css'),
  )
  return componentStylesheets.flatMap((file) =>
    leafRules(readFileSync(file, 'utf8'))
      .filter((rule) => {
        const background = declaredValue(rule.body, 'background')
        const backgroundColor = declaredValue(rule.body, 'background-color')
        const backgroundImage = declaredValue(rule.body, 'background-image')
        return [background, backgroundColor, backgroundImage].some((value) =>
          value?.includes(ACTIVE_FILL),
        )
      })
      .map((rule) => ({
        file: relative(process.cwd(), file),
        selector: rule.selector,
        label: declaredValue(rule.body, 'color'),
      })),
  )
}

function declarationsIn(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim())
    }
  }
  return map
}

function arrisPalette(appearance: 'light' | 'dark'): Map<string, string> {
  const css = stripComments(readFileSync(join(designSystem, 'tokens-arris.css'), 'utf8'))
  const bodyFor = (selector: string): string => {
    const pattern = new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    )
    return css.match(pattern)?.[1] ?? ''
  }
  const light = declarationsIn(bodyFor(ARRIS_SCOPE))
  if (appearance === 'light') {
    return light
  }
  return new Map([...light, ...declarationsIn(bodyFor(ARRIS_DARK_SCOPE))])
}

function resolveColor(name: string, vars: Map<string, string>): string {
  const value = vars.get(name) ?? name
  const captured = value.match(/var\((--[\w-]+)\)/)?.[1]
  return captured !== undefined ? resolveColor(captured, vars) : value
}

describe('active-impression label reversal', () => {
  it('finds the active fill in use, so the scan below is not vacuous', () => {
    expect(activeFillRules().length).toBeGreaterThan(0)
  })

  it('reverses the label on every rule that fills with the active surface', () => {
    const unreversed = activeFillRules().filter((rule) => rule.label !== REVERSED_LABEL)

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
