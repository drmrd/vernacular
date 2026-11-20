import { describe, expect, it, vi } from 'vitest'
import { auditCommits, parseGitLog } from './cycle-audit.mjs'
import { runRgbAudit } from './rgb-audit.mjs'
import { exemptTestFiles } from './scope-rules.mjs'

const RECORD_SEPARATOR = '\x1e'
const UNIT_SEPARATOR = '\x1f'

function record({ sha, subject, infra = '', files = [] }) {
  const header = [sha, subject, infra].join(UNIT_SEPARATOR)
  return [header, ...files].join('\n')
}

function gitLog(records) {
  return records.map(record).join(RECORD_SEPARATOR)
}

function audit(records, diffs = {}) {
  const readCommitDiff = vi.fn((sha) => diffs[sha] ?? '')
  const violations = auditCommits(parseGitLog(gitLog(records)), { readCommitDiff })
  return { violations, readCommitDiff }
}

/** One file section of `git show -M --unified=0`: a content change. */
function modifiedSection(path, changedLines) {
  const body = changedLines.join('\n')
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1 +1 @@',
    body,
    '',
  ].join('\n')
}

/** One file section of `git show -M --unified=0`: a rename, with optional edits. */
function renamedSection({ from, to, similarity = 100, changedLines = [] }) {
  const header = [
    `diff --git a/${from} b/${to}`,
    `similarity index ${similarity}%`,
    `rename from ${from}`,
    `rename to ${to}`,
  ]
  if (changedLines.length === 0) return header.concat('').join('\n')
  const hunk = [`--- a/${from}`, `+++ b/${to}`, '@@ -1 +1 @@', ...changedLines]
  return header.concat('index 1111111..2222222 100644', hunk, '').join('\n')
}

const ASSERTION_CHANGE = ['-expect(total()).toBe(1)', '+expect(total()).toBe(2)']
const IMPORT_PATH_CHANGE = [
  "-import { total } from './old-path'",
  "+import { total } from './new-path'",
]

describe('auditCommits refactor scope', () => {
  it('flags a refactor commit that changes a test file', () => {
    const diff = modifiedSection('core/a.test.ts', ASSERTION_CHANGE)

    const { violations } = audit(
      [{ sha: 'blue1111', subject: 'refactor: tidy', files: ['core/a.ts', 'core/a.test.ts'] }],
      { blue1111: diff },
    )

    expect(violations).toHaveLength(1)
    expect(violations[0].sha).toBe('blue1111')
    expect(violations[0].rule).toBe('refactor-scope')
    expect(violations[0].message).toContain('core/a.test.ts')
    expect(violations[0].message).not.toContain('core/a.ts')
  })

  it('accepts an empty refactor marker and one that changes test support only', () => {
    const { violations } = audit([
      { sha: 'blue2222', subject: 'refactor: mark the widget cycle blue', files: [] },
      { sha: 'blue3333', subject: 'refactor: tidy', files: ['core/x-test-support.ts'] },
    ])

    expect(violations).toEqual([])
  })

  it('accepts a refactor commit whose test-file change only updates import paths', () => {
    const diff = modifiedSection('core/a.test.ts', IMPORT_PATH_CHANGE)

    const { violations } = audit(
      [{ sha: 'blue4444', subject: 'refactor: move total', files: ['core/a.test.ts'] }],
      { blue4444: diff },
    )

    expect(violations).toEqual([])
  })

  it('accepts a refactor commit that purely renames a test file', () => {
    const diff = renamedSection({ from: 'core/old.test.ts', to: 'core/new.test.ts' })

    const { violations } = audit(
      [{ sha: 'blue5555', subject: 'refactor: rename the spec', files: ['core/new.test.ts'] }],
      { blue5555: diff },
    )

    expect(violations).toEqual([])
  })

  it('flags a refactor commit that mixes an import update with an assertion change', () => {
    const diff = modifiedSection('core/a.test.ts', [...IMPORT_PATH_CHANGE, ...ASSERTION_CHANGE])

    const { violations } = audit(
      [{ sha: 'blue6666', subject: 'refactor: move total', files: ['core/a.test.ts'] }],
      { blue6666: diff },
    )

    expect(violations.map((violation) => violation.rule)).toEqual(['refactor-scope'])
    expect(violations[0].message).toContain('core/a.test.ts')
  })

  it('still closes the cycle when it flags the refactor', () => {
    const diff = modifiedSection('core/a.test.ts', ASSERTION_CHANGE)

    const { violations } = audit(
      [
        { sha: 'red77777', subject: 'test: pin the widget', files: ['core/a.test.ts'] },
        { sha: 'green888', subject: 'feat: add the widget', files: ['core/a.ts'] },
        { sha: 'blue9999', subject: 'refactor: tidy', files: ['core/a.test.ts'] },
      ],
      { blue9999: diff },
    )

    expect(violations.map((violation) => violation.rule)).toEqual(['refactor-scope'])
    expect(violations[0].sha).toBe('blue9999')
  })

  it('lists only the non-exempt test files of a refactor commit', () => {
    const diff =
      renamedSection({ from: 'core/old.test.ts', to: 'core/new.test.ts' }) +
      modifiedSection('core/b.test.ts', ASSERTION_CHANGE)

    const { violations } = audit(
      [
        {
          sha: 'blue1010',
          subject: 'refactor: rename and tidy',
          files: ['core/new.test.ts', 'core/b.test.ts'],
        },
      ],
      { blue1010: diff },
    )

    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('core/b.test.ts')
    expect(violations[0].message).not.toContain('core/new.test.ts')
  })

  it('does not read a diff for a refactor commit without a test file', () => {
    const { violations, readCommitDiff } = audit([
      {
        sha: 'blue1111',
        subject: 'refactor: tidy',
        files: ['core/a.ts', 'core/x-test-support.ts'],
      },
      { sha: 'blue1212', subject: 'refactor: mark the widget cycle blue', files: [] },
    ])

    expect(violations).toEqual([])
    expect(readCommitDiff).not.toHaveBeenCalled()
  })

  it('reads the diff of a refactor commit that touches a test file, once', () => {
    const diff = modifiedSection('core/a.test.ts', IMPORT_PATH_CHANGE)

    const { readCommitDiff } = audit(
      [{ sha: 'blue1313', subject: 'refactor: move total', files: ['core/a.test.ts'] }],
      { blue1313: diff },
    )

    expect(readCommitDiff).toHaveBeenCalledTimes(1)
    expect(readCommitDiff).toHaveBeenCalledWith('blue1313')
  })

  it('exempts an Infrastructure refactor commit', () => {
    const diff = modifiedSection('core/a.test.ts', ASSERTION_CHANGE)

    const { violations } = audit(
      [
        {
          sha: 'blue1414',
          subject: 'refactor: rewire the runner',
          infra: 'runner wiring',
          files: ['core/a.test.ts'],
        },
      ],
      { blue1414: diff },
    )

    expect(violations).toEqual([])
  })

  it('flags every test-file change when no diff reader is given', () => {
    const commits = parseGitLog(
      gitLog([{ sha: 'blue1515', subject: 'refactor: move total', files: ['core/a.test.ts'] }]),
    )

    const violations = auditCommits(commits)

    expect(violations.map((violation) => violation.rule)).toEqual(['refactor-scope'])
    expect(violations[0].message).toContain('core/a.test.ts')
  })
})

describe('exemptTestFiles', () => {
  it('exempts an import-only test file and not one that changes an assertion', () => {
    const diff =
      modifiedSection('core/a.test.ts', IMPORT_PATH_CHANGE) +
      modifiedSection('core/b.test.ts', ASSERTION_CHANGE)

    const exempt = exemptTestFiles(diff)

    expect(exempt.has('core/a.test.ts')).toBe(true)
    expect(exempt.has('core/b.test.ts')).toBe(false)
  })

  it('exempts a multi-line import whose lines are all names or the closing from clause', () => {
    const diff = modifiedSection('core/a.test.ts', [
      '-import {',
      '-  a,',
      '-  b,',
      "-} from './x'",
      '+import {',
      '+  a,',
      '+  b,',
      "+} from './y'",
    ])

    expect(exemptTestFiles(diff).has('core/a.test.ts')).toBe(true)
  })

  it('exempts export-from statements and a bare from line', () => {
    const diff = modifiedSection('core/a.test.ts', [
      "-export { a } from './x'",
      "+export { a } from './y'",
      "-  from './x'",
      "+  from './y'",
    ])

    expect(exemptTestFiles(diff).has('core/a.test.ts')).toBe(true)
  })

  it('exempts a pure rename under its new path', () => {
    const diff = renamedSection({ from: 'core/old.test.ts', to: 'core/new.test.ts' })

    const exempt = exemptTestFiles(diff)

    expect(exempt.has('core/new.test.ts')).toBe(true)
    expect(exempt.has('core/old.test.ts')).toBe(false)
  })

  it('does not exempt a 90 percent rename that also changes an assertion', () => {
    const diff = renamedSection({
      from: 'core/old.test.ts',
      to: 'core/new.test.ts',
      similarity: 90,
      changedLines: ASSERTION_CHANGE,
    })

    expect(exemptTestFiles(diff).has('core/new.test.ts')).toBe(false)
  })

  it('exempts a rename that only updates import paths', () => {
    const diff = renamedSection({
      from: 'core/old.test.ts',
      to: 'core/new.test.ts',
      similarity: 95,
      changedLines: IMPORT_PATH_CHANGE,
    })

    expect(exemptTestFiles(diff).has('core/new.test.ts')).toBe(true)
  })

  it('returns an empty set for an empty diff', () => {
    expect(exemptTestFiles('').size).toBe(0)
  })
})

describe('runRgbAudit refactor scope', () => {
  it('reads each refactor diff with a rename-aware git show over the whole commit', async () => {
    const log = gitLog([
      { sha: 'blue1616', subject: 'refactor: move total', files: ['core/a.test.ts'] },
    ])
    const diff = modifiedSection('core/a.test.ts', IMPORT_PATH_CHANGE)
    const calls = []
    const runGit = (args) => {
      calls.push([...args])
      return args[0] === 'show' ? diff : log
    }

    const code = await runRgbAudit([], { runGit, log: vi.fn() })

    expect(code).toBe(0)
    expect(calls).toContainEqual(['show', '-M', '--format=', '--unified=0', 'blue1616'])
  })
})
