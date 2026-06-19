import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'editor/shell/project-identity.css'), 'utf8')

describe('project-identity.css', () => {
  it('renders the project name in the heading font on the extended type scale', () => {
    // The rail primary heading already uses the heading family; behavior 12
    // promotes its size to a scale token (--font-size-lg) and drops the raw
    // 1.05rem literal.
    const name = css.match(/\.project-identity__name\s*\{[^}]*\}/)?.[0] ?? ''
    expect(name).not.toBe('')
    expect(name).toContain('var(--font-family-heading)')
    expect(name).toMatch(/font-size:\s*var\(--font-size-/)
    expect(name).not.toMatch(/font-size:\s*1\.05rem/)
  })
})
