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

  // Behavior 2 of 10 (characterizations folded in alongside the live guard):
  // the ratchet drops covered modules from `unlisted`, surfaces stale-covered
  // and stale-missing allowlist entries, and never misclassifies hooks,
  // lowercase helpers, PascalCase non-function consts, or type-only exports as
  // component modules. Each case stands up its own isolated temp tree so the
  // assertions stay Independent and Repeatable.
  it('does not flag a component module that has a co-located story', () => {
    const treeRoot = mkdtempSync(join(tmpdir(), 'story-coverage-covered-'))
    const componentDir = join(treeRoot, 'widgets')
    mkdirSync(componentDir, { recursive: true })
    const barModule = join(componentDir, 'bar.tsx')
    writeFileSync(barModule, 'export function Bar() { return null }\n', 'utf8')
    writeFileSync(
      join(componentDir, 'bar.stories.tsx'),
      'export default { component: () => null }\n',
      'utf8',
    )

    const result = findUncoveredComponentModules({
      roots: [treeRoot],
      allowlist: [],
    })

    expect(result.unlisted).not.toContain(barModule)

    rmSync(treeRoot, { recursive: true, force: true })
  })

  it('flags an allowlist entry that now has a story as stale-covered', () => {
    const treeRoot = mkdtempSync(join(tmpdir(), 'story-coverage-stale-'))
    const componentDir = join(treeRoot, 'widgets')
    mkdirSync(componentDir, { recursive: true })
    const bazModule = join(componentDir, 'baz.tsx')
    writeFileSync(bazModule, 'export function Baz() { return null }\n', 'utf8')
    writeFileSync(
      join(componentDir, 'baz.stories.tsx'),
      'export default { component: () => null }\n',
      'utf8',
    )

    const result = findUncoveredComponentModules({
      roots: [treeRoot],
      allowlist: [bazModule],
    })

    expect(result.staleCovered).toContain(bazModule)
    expect(result.unlisted).not.toContain(bazModule)

    rmSync(treeRoot, { recursive: true, force: true })
  })

  it('flags an allowlist entry whose file is gone as stale-missing', () => {
    const treeRoot = mkdtempSync(join(tmpdir(), 'story-coverage-gone-'))
    mkdirSync(treeRoot, { recursive: true })
    const goneModule = join(treeRoot, 'widgets', 'gone.tsx')

    const result = findUncoveredComponentModules({
      roots: [treeRoot],
      allowlist: [goneModule],
    })

    expect(result.staleMissing).toContain(goneModule)

    rmSync(treeRoot, { recursive: true, force: true })
  })

  it('does not classify hooks, helpers, non-function consts, or types as component modules', () => {
    const treeRoot = mkdtempSync(join(tmpdir(), 'story-coverage-exclude-'))
    const componentDir = join(treeRoot, 'widgets')
    mkdirSync(componentDir, { recursive: true })
    const hookModule = join(componentDir, 'use-thing.tsx')
    const helperModule = join(componentDir, 'helpers.tsx')
    const contextModule = join(componentDir, 'theme-context.tsx')
    const typesModule = join(componentDir, 'types.tsx')
    writeFileSync(
      hookModule,
      'export function useThing() { return null }\n',
      'utf8',
    )
    writeFileSync(helperModule, 'export function helper() { return 1 }\n', 'utf8')
    writeFileSync(
      contextModule,
      "import { createContext } from 'react'\n" +
        'export const ThemeContext = createContext(null)\n',
      'utf8',
    )
    writeFileSync(
      typesModule,
      'export type Widget = { id: string }\n',
      'utf8',
    )

    const result = findUncoveredComponentModules({
      roots: [treeRoot],
      allowlist: [],
    })

    expect(result.unlisted).not.toContain(hookModule)
    expect(result.unlisted).not.toContain(helperModule)
    expect(result.unlisted).not.toContain(contextModule)
    expect(result.unlisted).not.toContain(typesModule)

    rmSync(treeRoot, { recursive: true, force: true })
  })
})
