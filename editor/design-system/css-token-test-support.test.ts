import { describe, it, expect } from 'vitest'

import { declarationsIn, leafRules, resolveColor } from './css-token-test-support'

// The stylesheet scanners in this directory are only as trustworthy as the reader
// beneath them: a guard that silently skips a rule reports a clean scan over a
// stylesheet it never read. The at-rule case is the one that matters in practice,
// because both token layers express their appearance preferences and the
// coarse-pointer target floor inside `@media` blocks.

describe('leafRules', () => {
  it('reads a flat rule', () => {
    expect(leafRules('.chip { color: red; }')).toEqual([
      { selector: '.chip', body: ' color: red; ' },
    ])
  })

  it('reads a rule nested inside an at-rule rather than skipping it', () => {
    const rules = leafRules('@media (pointer: coarse) { .chip { min-height: 44px; } }')

    expect(rules.map((rule) => rule.selector)).toEqual(['.chip'])
    expect(rules[0]?.body).toContain('min-height: 44px')
  })

  it('keeps reading after an at-rule closes', () => {
    const rules = leafRules('@media (pointer: coarse) { .a { color: red; } } .b { color: blue; }')

    expect(rules.map((rule) => rule.selector)).toEqual(['.a', '.b'])
  })

  it('ignores declarations inside comments', () => {
    expect(leafRules('/* .ghost { color: red; } */ .real { color: blue; }')).toHaveLength(1)
  })
})

describe('declarationsIn and resolveColor', () => {
  it('follows a var chain to the literal at its end', () => {
    const vars = declarationsIn('--ink: #23272b; --color-text: var(--ink);')

    expect(resolveColor('--color-text', vars)).toBe('#23272b')
  })

  it('returns the name unchanged when nothing declares it', () => {
    expect(resolveColor('#ffffff', new Map())).toBe('#ffffff')
  })
})
