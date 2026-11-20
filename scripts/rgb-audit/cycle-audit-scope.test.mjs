import { describe, expect, it } from 'vitest'
import { auditCommits, parseGitLog } from './cycle-audit.mjs'
import { isTestAsset, isTestFile } from './test-files.mjs'
import { gitLog } from './cycle-audit-test-support.mjs'

function audit(records) {
  return auditCommits(parseGitLog(gitLog(records)))
}

describe('auditCommits test scope', () => {
  it('accepts a RED commit that changes tests, test support, fixtures, stories, and e2e files', () => {
    const violations = audit([
      {
        sha: 'red1111',
        subject: 'test: pin the widget',
        files: [
          'core/a.test.ts',
          'bridge/react/x-test-support.tsx',
          'core/scene/y-test-fixtures.ts',
          'storage/fs/directory-contract.ts',
          'tests/architecture/import-graph.ts',
          'editor/a.stories.tsx',
          'e2e/tests/a.spec.ts',
        ],
      },
    ])

    expect(violations).toEqual([])
  })

  it('flags a RED commit that changes implementation', () => {
    const violations = audit([
      {
        sha: 'red2222',
        subject: 'test: pin the widget',
        files: ['core/a.test.ts', 'core/a.ts'],
      },
    ])

    expect(violations).toEqual([
      {
        sha: 'red2222',
        rule: 'test-scope',
        message: expect.stringContaining('core/a.ts'),
      },
    ])
  })

  it('names only the implementation files, not the test files, in the message', () => {
    const [violation] = audit([
      {
        sha: 'red3333',
        subject: 'test: pin the widget',
        files: ['core/a.test.ts', 'core/a.ts'],
      },
    ])

    expect(violation.message).not.toContain('core/a.test.ts')
  })

  it('words the violation with the sha and the comma-joined implementation files', () => {
    const violations = audit([
      {
        sha: 'red7777',
        subject: 'test: pin the widget',
        files: ['core/a.test.ts', 'core/a.ts', 'core/b.ts'],
      },
    ])

    expect(violations).toEqual([
      {
        sha: 'red7777',
        rule: 'test-scope',
        message: 'RED commit red7777 changes non-test file(s): core/a.ts, core/b.ts',
      },
    ])
  })

  it('does not apply the scope rule to e2e-scoped or Infrastructure commits', () => {
    const violations = audit([
      {
        sha: 'e2e44444',
        subject: 'test(e2e): add a journey',
        files: ['e2e/tests/a.spec.ts', 'core/a.ts'],
      },
      {
        sha: 'infra555',
        subject: 'test: wire the runner',
        infra: 'runner wiring',
        files: ['core/a.test.ts', 'package.json'],
      },
    ])

    expect(violations).toEqual([])
  })

  it('accepts an empty RED commit', () => {
    const violations = audit([{ sha: 'red6666', subject: 'test: pin the widget', files: [] }])

    expect(violations).toEqual([])
  })
})

describe('isTestFile', () => {
  it.each(['core/a.test.ts', 'editor/a.test.tsx', 'scripts/a.test.mjs', 'scripts/a.test.js'])(
    'is true for %s',
    (path) => {
      expect(isTestFile(path)).toBe(true)
    },
  )

  it.each(['core/a.ts', 'core/a-test-support.ts', 'editor/a.spec.tsx', 'docs/x.md'])(
    'is false for %s',
    (path) => {
      expect(isTestFile(path)).toBe(false)
    },
  )
})

describe('isTestAsset', () => {
  it.each([
    'core/a.test.ts',
    'editor/a.spec.tsx',
    'storage/fs/directory-contract.ts',
    'bridge/react/x-test-support.tsx',
    'core/y-test-kit.ts',
    'core/scene/y-test-fixtures.ts',
    'scripts/z-test-setup.mjs',
    'core/testing/helpers.ts',
    'core/fixtures/plan.json',
    'editor/__screenshots__/a.png',
    'editor/a-snapshots/b.png',
    'core/fixture.ts',
    'core/fixtures.json',
    'tests/architecture/import-graph.ts',
    'e2e/tests/helpers.ts',
    'editor/a.stories.tsx',
  ])('is true for %s', (path) => {
    expect(isTestAsset(path)).toBe(true)
  })

  it.each(['core/a.ts', 'docs/x.md', 'scripts/fixture-loader.ts', 'editor/a.tsx', 'package.json'])(
    'is false for %s',
    (path) => {
      expect(isTestAsset(path)).toBe(false)
    },
  )
})
