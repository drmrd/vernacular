import { describe, expect, it } from 'vitest'
import { auditCommits, parseGitLog } from './cycle-audit.mjs'

const RECORD_SEPARATOR = '\x1e'
const UNIT_SEPARATOR = '\x1f'

function record({ sha, subject, infra = '', files = [] }) {
  const header = [sha, subject, infra].join(UNIT_SEPARATOR)
  return [header, ...files].join('\n')
}

function gitLog(records) {
  return records.map(record).join(RECORD_SEPARATOR)
}

describe('parseGitLog', () => {
  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('parses conventional, scoped, and infrastructure-flagged commits from a multi-record sample', () => {
    const raw = gitLog([
      {
        sha: 'aaa1111',
        subject: 'test: pin the widget',
        files: ['core/widget.test.ts'],
      },
      {
        sha: 'bbb2222',
        subject: 'feat(widget): add the widget',
        files: ['core/widget.ts'],
      },
      {
        sha: 'ccc3333',
        subject: 'chore: tidy build',
        infra: 'build wiring',
        files: ['package.json'],
      },
    ])

    expect(parseGitLog(raw)).toEqual([
      {
        sha: 'aaa1111',
        type: 'test',
        scope: '',
        subject: 'pin the widget',
        files: ['core/widget.test.ts'],
        infra: false,
      },
      {
        sha: 'bbb2222',
        type: 'feat',
        scope: 'widget',
        subject: 'add the widget',
        files: ['core/widget.ts'],
        infra: false,
      },
      {
        sha: 'ccc3333',
        type: 'chore',
        scope: '',
        subject: 'tidy build',
        files: ['package.json'],
        infra: true,
      },
    ])
  })

  it('keeps an unparseable subject as the raw line with empty type and scope', () => {
    const raw = gitLog([
      {
        sha: 'ddd4444',
        subject: 'not a conventional subject',
        files: ['README.md'],
      },
    ])

    expect(parseGitLog(raw)).toEqual([
      {
        sha: 'ddd4444',
        type: '',
        scope: '',
        subject: 'not a conventional subject',
        files: ['README.md'],
        infra: false,
      },
    ])
  })
})

function commit(overrides = {}) {
  return {
    sha: 's',
    type: '',
    scope: '',
    subject: '',
    files: [],
    infra: false,
    ...overrides,
  }
}

describe('auditCommits ordering', () => {
  it('reports no violations when a green commit follows a red commit before a blue commit', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'blue1', type: 'refactor', files: ['core/w.ts'] }),
    ]

    expect(auditCommits(commits)).toEqual([])
  })

  it('flags a green commit with no preceding red commit as an ordering violation', () => {
    const commits = [commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] })]

    expect(auditCommits(commits)).toEqual([
      {
        sha: 'green1',
        rule: 'ordering',
        message: expect.stringContaining('no preceding'),
      },
    ])
  })

  it('consumes the whole red phase per green, so a second green needs its own red', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'red2', type: 'test', files: ['core/x.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'green2', type: 'feat', files: ['core/x.ts'] }),
    ]

    expect(auditCommits(commits)).toEqual([
      {
        sha: 'green2',
        rule: 'ordering',
        message: expect.stringContaining('no preceding'),
      },
    ])
  })
})

describe('auditCommits independence', () => {
  it('flags a green commit that changes a test file as an independence violation', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts', 'core/w.test.ts'] }),
      commit({ sha: 'blue1', type: 'refactor', files: ['core/w.ts'] }),
    ]

    expect(auditCommits(commits)).toContainEqual({
      sha: 'green1',
      rule: 'independence',
      message: expect.stringContaining('w.test.ts'),
    })
  })

  it('does not flag a green commit that changes only implementation files', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'blue1', type: 'refactor', files: ['core/w.ts'] }),
    ]

    const violations = auditCommits(commits)

    expect(violations.some((v) => v.rule === 'independence')).toBe(false)
  })
})

describe('auditCommits blue presence', () => {
  it('flags a green commit left open when a new red cycle begins before any blue', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'red2', type: 'test', files: ['core/x.test.ts'] }),
    ]

    expect(auditCommits(commits)).toContainEqual({
      sha: 'green1',
      rule: 'blue',
      message: expect.stringContaining('not closed by a BLUE'),
    })
  })

  it('flags a green commit left open at the end of the range', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
    ]

    expect(auditCommits(commits)).toContainEqual({
      sha: 'green1',
      rule: 'blue',
      message: expect.stringContaining('not closed by a BLUE'),
    })
  })

  it('does not flag a green commit closed by a blue refactor commit', () => {
    const commits = [
      commit({ sha: 'red1', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'green1', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'blue1', type: 'refactor', files: ['core/w.ts'] }),
    ]

    const violations = auditCommits(commits)

    expect(violations.some((v) => v.rule === 'blue')).toBe(false)
  })
})
