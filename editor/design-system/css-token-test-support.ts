/*
 * Shared reading helpers for the stylesheet-scanning tests in this directory.
 *
 * jsdom does not apply stylesheets, so a computed-pixel or computed-color
 * assertion is not available to a unit test here. The design system's guards
 * therefore read the CSS as text and assert on the declarations themselves, an
 * idiom this directory already uses in several places. Each guard grew its own
 * copy of the same four readers; they live here once so a parser fix reaches
 * every scanner instead of one.
 *
 * This is a test-support module, not a runtime export: nothing under editor/
 * imports it outside a test.
 */

/** The attribute selectors the Arris token layer scopes itself under (ADR-0162). */
export const ARRIS_SCOPE = "[data-design-language='arris']"
export const ARRIS_DARK_SCOPE = `${ARRIS_SCOPE}[data-theme='dark']`

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Bodies of every flat declaration block opened by exactly this selector. */
export function blockBodies(css: string, selector: string): string[] {
  const pattern = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g')
  return [...stripComments(css).matchAll(pattern)].map((match) => match[1] ?? '')
}

/** The custom properties a block declares, in declaration order. */
export function declarationsIn(block: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value.trim())
    }
  }
  return declarations
}

/**
 * Follows a `var(--a)` chain to the literal at its end. A token whose value points
 * at another token resolves against the same block, which is how both languages
 * express a role in terms of a palette entry.
 */
export function resolveColor(name: string, vars: Map<string, string>): string {
  const value = vars.get(name) ?? name
  const captured = value.match(/var\((--[\w-]+)\)/)?.[1]
  return captured !== undefined ? resolveColor(captured, vars) : value
}

/**
 * A selector's specificity as (ids, classes, elements), comparable position by
 * position. Attributes and pseudo-classes count with classes, pseudo-elements with
 * elements. `:not()` counts as one rather than by its argument, a simplification the
 * design system's selectors never exercise: nothing here nests a more specific
 * selector inside a negation.
 */
export function specificity(selector: string): [number, number, number] {
  const withoutPseudoElements = selector.replace(/::[a-z-]+/g, '')
  const count = (pattern: RegExp): number => (withoutPseudoElements.match(pattern) ?? []).length
  const classes = count(/\.[\w-]+/g) + count(/\[[^\]]*\]/g) + count(/:[a-z-]+(\([^)]*\))?/g)
  return [count(/#[\w-]+/g), classes, (selector.match(/::[a-z-]+/g) ?? []).length]
}

/** Negative when a is weaker than b, positive when stronger, zero when equal. */
export function compareSpecificity(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

export interface CssRule {
  selector: string
  body: string
}

/**
 * Every rule that declares properties, including rules nested inside an at-rule.
 * An at-rule block is not itself a rule: `@media (pointer: coarse) { .x { … } }`
 * contributes `.x`, which is what a scanner over declarations wants. The nesting
 * is real here, because both token layers express appearance preferences and the
 * coarse-pointer target floor as media-wrapped rules.
 */
export function leafRules(css: string): CssRule[] {
  return collectRules(stripComments(css))
}

function collectRules(source: string): CssRule[] {
  const rules: CssRule[] = []
  let selectorStart = 0
  let depth = 0
  let blockStart = 0
  let selector = ''
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
        rules.push(...rulesFromBlock(selector, source.slice(blockStart, index)))
        selectorStart = index + 1
      }
    }
  }
  return rules
}

function rulesFromBlock(selector: string, body: string): CssRule[] {
  return body.includes('{') ? collectRules(body) : [{ selector, body }]
}
