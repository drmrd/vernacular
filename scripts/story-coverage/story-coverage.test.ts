import { relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findUncoveredComponentModules } from './coverage'
import { UNCOVERED_COMPONENTS } from './uncovered-components'

// Behavior 2 of 10: the live story-coverage guardrail. Walking the real
// app/editor/bridge trees, every `.tsx` that exports a PascalCase component
// must have a co-located `<basename>.stories.tsx` OR be recorded on the
// tolerated-uncovered allowlist. The allowlist is a committed ratchet that
// shrinks as stories land, so the guard also fails when an allowlist entry now
// has a story (stale-covered) or no longer exists on disk (stale-missing). The
// allowlist stores REPO-RELATIVE POSIX paths so the data is portable across
// machines/CI; the guard resolves each to an absolute path at call time and
// reports offenders back as repo-relative paths. Mirrors the css-literal-guard
// `expect(arr, '<descriptive report>').toEqual([])` idiom.

const repoRoot = resolve(process.cwd())
const roots = ['app', 'editor', 'bridge'].map((dir) => resolve(repoRoot, dir))
const allowlist = UNCOVERED_COMPONENTS.map((entry) => resolve(repoRoot, entry.file))

function reportPaths(paths: string[]): string {
  return paths.map((path) => relative(repoRoot, path)).join('\n')
}

describe('story coverage guard', () => {
  const result = findUncoveredComponentModules({ roots, allowlist })

  it('records every uncovered component module on the allowlist', () => {
    expect(
      result.unlisted,
      `${reportPaths(result.unlisted)}\n\n` +
        `export a component but have no co-located <name>.stories.tsx and are ` +
        `not on the story-coverage allowlist. Add a story or record the file ` +
        `in scripts/story-coverage/uncovered-components.ts.`,
    ).toEqual([])
  })

  it('drops allowlist entries once they have a story', () => {
    expect(
      result.staleCovered,
      `${reportPaths(result.staleCovered)}\n\n` +
        `are on the uncovered-components allowlist but now have a story; ` +
        `remove them from scripts/story-coverage/uncovered-components.ts.`,
    ).toEqual([])
  })

  it('drops allowlist entries for files that no longer exist', () => {
    expect(
      result.staleMissing,
      `${reportPaths(result.staleMissing)}\n\n` +
        `are on the allowlist but no longer exist; remove the stale entries.`,
    ).toEqual([])
  })
})
