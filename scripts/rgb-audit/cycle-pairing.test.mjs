import { describe, expect, it } from 'vitest'
import { parseGitLog } from './cycle-audit.mjs'
import { gitLog } from './cycle-audit-test-support.mjs'
import { pairGreenCycles } from './cycle-pairing.mjs'

function pairShas(records) {
  return pairGreenCycles(parseGitLog(gitLog(records))).map(({ green, reds }) => ({
    green: green.sha,
    reds: reds.map((red) => red.sha),
  }))
}

describe('pairGreenCycles', () => {
  it('pairs a GREEN commit with every RED commit since the previous GREEN', () => {
    expect(
      pairShas([
        { sha: 'r1', subject: 'test: pin one', files: ['core/a.test.ts'] },
        { sha: 'r2', subject: 'test: pin two', files: ['core/b.test.ts'] },
        { sha: 'g1', subject: 'feat: add a', files: ['core/a.ts'] },
        { sha: 'b1', subject: 'refactor: tidy a', files: ['core/a.ts'] },
        { sha: 'r3', subject: 'test: pin three', files: ['core/c.test.ts'] },
        { sha: 'g2', subject: 'fix: repair c', files: ['core/c.ts'] },
      ]),
    ).toEqual([
      { green: 'g1', reds: ['r1', 'r2'] },
      { green: 'g2', reds: ['r3'] },
    ])
  })

  it('keeps the pool across BLUE and exempt commits before the GREEN commit', () => {
    expect(
      pairShas([
        { sha: 'r1', subject: 'test: pin one', files: ['core/a.test.ts'] },
        { sha: 'b1', subject: 'refactor: tidy a', files: ['core/a.ts'] },
        { sha: 'd1', subject: 'docs: note a', files: ['docs/a.md'] },
        { sha: 'g1', subject: 'feat: add a', files: ['core/a.ts'] },
      ]),
    ).toEqual([{ green: 'g1', reds: ['r1'] }])
  })

  it('gives a GREEN commit with no RED before it an empty pool', () => {
    expect(pairShas([{ sha: 'g1', subject: 'feat: add a', files: ['core/a.ts'] }])).toEqual([
      { green: 'g1', reds: [] },
    ])
  })

  it('ignores e2e-scoped tests and Infrastructure commits when filling the pool', () => {
    expect(
      pairShas([
        { sha: 'e1', subject: 'test(e2e): journey', files: ['e2e/tests/j.spec.ts'] },
        { sha: 'r1', subject: 'test: glue', infra: 'glue', files: ['core/a.test.ts'] },
        { sha: 'r2', subject: 'test: pin two', files: ['core/b.test.ts'] },
        { sha: 'g1', subject: 'feat: add b', files: ['core/b.ts'] },
      ]),
    ).toEqual([{ green: 'g1', reds: ['r2'] }])
  })
})
