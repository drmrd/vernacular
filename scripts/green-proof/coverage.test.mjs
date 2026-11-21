import { describe, expect, it } from 'vitest'
import { parseLcov, splitByCoverage, uncoveredLineFindings } from './coverage.mjs'

const ROOT = '/tmp/green-proof-x/worktree'

/** @param {string} file @param {number} line */
const added = (file, line) => ({ file, line, text: `line ${line}` })

describe('parseLcov', () => {
  it('keys coverage by repository path under the worktree root', () => {
    const raw = `SF:${ROOT}/core/a.ts\nDA:3,2\nDA:4,0\nend_of_record\n`
    expect(parseLcov(raw, ROOT)).toEqual(
      new Map([
        [
          'core/a.ts',
          new Map([
            [3, 2],
            [4, 0],
          ]),
        ],
      ]),
    )
  })

  it('keeps a relative SF path as it is', () => {
    const raw = 'SF:core/b.ts\nDA:1,5\nend_of_record\n'
    expect(parseLcov(raw, ROOT)).toEqual(new Map([['core/b.ts', new Map([[1, 5]])]]))
  })

  it('reads the count of a DA entry that carries a hash', () => {
    const raw = 'SF:core/b.ts\nDA:7,3,abc123\nend_of_record\n'
    expect(parseLcov(raw, ROOT).get('core/b.ts')).toEqual(new Map([[7, 3]]))
  })

  it('maps every record and ignores the other lcov lines', () => {
    const raw = [
      'TN:',
      `SF:${ROOT}/core/a.ts`,
      'FN:1,foo',
      'DA:1,1',
      'BRDA:1,0,0,1',
      'LF:1',
      'LH:1',
      'end_of_record',
      `SF:${ROOT}/engine/c.ts`,
      'DA:2,0',
      'LF:1',
      'LH:0',
      'end_of_record',
    ].join('\n')
    expect(parseLcov(raw, ROOT)).toEqual(
      new Map([
        ['core/a.ts', new Map([[1, 1]])],
        ['engine/c.ts', new Map([[2, 0]])],
      ]),
    )
  })

  it('does not map a path outside the root onto a repository path', () => {
    const raw = 'SF:/other/core/a.ts\nDA:3,2\nend_of_record\n'
    expect(parseLcov(raw, ROOT).has('core/a.ts')).toBe(false)
  })

  it('adds the counts of two records for the same file', () => {
    const raw = `SF:${ROOT}/core/a.ts\nDA:3,2\nend_of_record\nSF:${ROOT}/core/a.ts\nDA:3,0\nend_of_record\n`
    expect(parseLcov(raw, ROOT).get('core/a.ts')).toEqual(new Map([[3, 2]]))
  })

  it('matches the root only at a path segment boundary, with or without a trailing slash', () => {
    const raw = `SF:${ROOT}/core/a.ts\nDA:1,1\nend_of_record\nSF:${ROOT}2/core/b.ts\nDA:1,1\nend_of_record\n`
    expect([...parseLcov(raw, `${ROOT}/`).keys()]).toEqual(['core/a.ts', `${ROOT}2/core/b.ts`])
  })

  it('reads a non-numeric count as zero', () => {
    const raw = `SF:${ROOT}/core/a.ts\nDA:2,abc\nend_of_record\n`
    expect(parseLcov(raw, ROOT).get('core/a.ts')).toEqual(new Map([[2, 0]]))
  })
})

describe('splitByCoverage', () => {
  it('splits added lines into covered, uncovered, and not executable', () => {
    const coverage = new Map([
      [
        'a.ts',
        new Map([
          [3, 2],
          [4, 0],
        ]),
      ],
    ])
    const lines = [added('a.ts', 3), added('a.ts', 4), added('a.ts', 5)]
    expect(splitByCoverage(lines, coverage)).toEqual({
      covered: [added('a.ts', 3)],
      uncovered: [added('a.ts', 4)],
      unrecorded: [],
    })
  })

  it('lists a changed file with no coverage record instead of counting it covered', () => {
    const lines = [added('storage/download/download-blob.ts', 9)]
    expect(splitByCoverage(lines, new Map())).toEqual({
      covered: [],
      uncovered: [],
      unrecorded: ['storage/download/download-blob.ts'],
    })
  })
})

describe('uncoveredLineFindings', () => {
  it('makes one finding per uncovered line under the given rule', () => {
    const lines = [added('a.ts', 4), added('b.ts', 8)]
    expect(uncoveredLineFindings(lines, 'abc1234', 'uncovered-added-line')).toEqual([
      {
        rule: 'uncovered-added-line',
        sha: 'abc1234',
        file: 'a.ts',
        line: 4,
        message: 'added line is not run by the RED tests',
      },
      {
        rule: 'uncovered-added-line',
        sha: 'abc1234',
        file: 'b.ts',
        line: 8,
        message: 'added line is not run by the RED tests',
      },
    ])
  })
})
