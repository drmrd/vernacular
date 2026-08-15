import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// Scoping a design language by attribute costs it the appearance-preference blocks
// the shipped layer declares against :root, because an attribute selector has equal
// specificity and this file loads second. Every one of those blocks has to be
// restated inside the Arris scope, and the tokens Arris introduces have to answer
// the same preferences the shipped tokens do.

const designSystem = resolve(process.cwd(), 'editor/design-system')
const shippedCss = readFileSync(resolve(designSystem, 'tokens.css'), 'utf8')
const arrisCss = readFileSync(resolve(designSystem, 'tokens-arris.css'), 'utf8')

// The base scope has to open a rule of its own. A plain substring search would also
// match the dark compound selector, so a block that restated only the dark rule and
// dropped the base one would pass while losing the preference for the light appearance.
const ARRIS_BASE_RULE = /\[data-design-language='arris'\]\s*\{/

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function mediaQueries(css: string): string[] {
  return [...stripComments(css).matchAll(/@media\s+([^{]+?)\s*\{/g)].map((match) =>
    (match[1] ?? '').trim(),
  )
}

/** The full body of an @media block, brace-balanced so nested rules survive. */
function mediaBody(css: string, query: string): string {
  const source = stripComments(css)
  const header = source.indexOf(`@media ${query}`)
  if (header === -1) {
    return ''
  }
  let depth = 0
  for (let index = source.indexOf('{', header); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(header, index + 1)
      }
    }
  }
  return ''
}

describe('Arris appearance preferences', () => {
  it('restates every preference block the shipped layer declares', () => {
    const missing = mediaQueries(shippedCss).filter(
      (query) => !ARRIS_BASE_RULE.test(mediaBody(arrisCss, query)),
    )
    expect(
      missing,
      `Preference blocks the Arris scope would swallow: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('zeroes every motion duration when reduced motion is asked for', () => {
    const body = mediaBody(arrisCss, '(prefers-reduced-motion: reduce)')
    expect(body).toMatch(/--motion-duration:\s*0ms/)
    expect(body).toMatch(/--motion-duration-max:\s*0ms/)
    expect(body).toMatch(/--motion-duration-detent:\s*0ms/)
  })

  it('strengthens the kerf line along with the border under high contrast', () => {
    // The kerf carries panel structure at 20 percent ink, which is exactly the tone
    // a high-contrast reader loses first, so it cannot be left at its resting value.
    const body = mediaBody(arrisCss, '(prefers-contrast: more)')
    expect(body).toMatch(/--color-border:/)
    expect(body).toMatch(/--color-kerf:/)
  })

  it('raises the drawn control sizes to the touch floor on a coarse pointer', () => {
    // ADR-0112 raises the hit area on touch. Arris draws a 28px control, which would
    // otherwise leave a visible control smaller than the region that responds to it.
    const body = mediaBody(arrisCss, '(pointer: coarse)')
    expect(body).toMatch(/--size-target-min:\s*var\(--size-target-min-touch\)/)
    expect(body).toMatch(/--size-control-height:\s*var\(--size-target-min-touch\)/)
    expect(body).toMatch(/--size-row-compact:\s*var\(--size-target-min\)/)
  })
})
