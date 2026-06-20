import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { findUncoveredComponentModules } from './coverage'

// Behavior 1 of 11: the story-coverage guardrail's forward ratchet. A component
// module that exports a PascalCase component but has no co-located
// `<basename>.stories.tsx` sibling and is not on the tolerated-uncovered
// allowlist must be flagged as `unlisted`. This pins the contract over a
// synthetic fixture tree under an OS temp dir so the logic stays independent of
// the real repository state.

const fixtureRoot = mkdtempSync(join(tmpdir(), 'story-coverage-'))

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

describe('findUncoveredComponentModules', () => {
  it('flags an uncovered component module that is not on the allowlist', () => {
    const componentDir = join(fixtureRoot, 'widgets')
    mkdirSync(componentDir, { recursive: true })
    const fooModule = join(componentDir, 'foo.tsx')
    writeFileSync(fooModule, 'export function Foo() { return null }\n', 'utf8')

    const result = findUncoveredComponentModules({
      roots: [fixtureRoot],
      allowlist: [],
    })

    expect(result.unlisted).toContain(fooModule)
    expect(result.staleCovered).toEqual([])
    expect(result.staleMissing).toEqual([])
  })
})
