import { describe, expect, it } from 'vitest'
import { hasFailingFinding, reportLines } from './green-proof-report.mjs'

const FIRST = 'g1000000'.padEnd(40, '0')
const SECOND = 'g2000000'.padEnd(40, '0')
const MESSAGE = 'added line is not run by the RED tests'

const cycle = (sha, findings) => ({
  sha,
  title: `feat: add ${sha.slice(0, 2)}`,
  status: 'failed',
  reason: '',
  notes: [],
  findings,
  timings: {},
})
const uncovered = (rule = 'uncovered-added-line') => ({
  rule,
  message: MESSAGE,
  file: 'core/a.ts',
  line: 7,
})
const run = (headSha, githubActions = false) => ({ range: 'main..topic', headSha, githubActions })

describe('reportLines', () => {
  it('prints each finding indented under the cycle it belongs to', () => {
    const lines = reportLines(
      [cycle(FIRST, [uncovered()]), cycle(SECOND, [uncovered()])],
      run(SECOND),
    )
    const finding = `    [fail] [uncovered-added-line] core/a.ts:7: ${MESSAGE}`
    expect(lines.map((line) => line.trim().split(' ')[0])).toEqual([
      'green:proof:',
      'g1000000',
      'time:',
      '[fail]',
      'g2000000',
      'time:',
      '[fail]',
    ])
    expect(lines[3]).toBe(finding)
    expect(lines[6]).toBe(finding)
  })

  it('puts failing findings before warnings within one cycle', () => {
    const lines = reportLines(
      [cycle(FIRST, [uncovered('mixed-uncovered-added-line'), uncovered()])],
      run(FIRST),
    )
    expect(lines.slice(3)).toEqual([
      `    [fail] [uncovered-added-line] core/a.ts:7: ${MESSAGE}`,
      `    [warn] [mixed-uncovered-added-line] core/a.ts:7: ${MESSAGE}`,
    ])
  })

  it('annotates a finding of the head commit with its file, line, and short sha', () => {
    const lines = reportLines([cycle(SECOND, [uncovered()])], run(SECOND, true))
    expect(lines).toContain(
      `::error file=core/a.ts,line=7,title=uncovered-added-line::g2000000 ${MESSAGE}`,
    )
  })

  it('annotates a finding of an earlier GREEN commit with its file and short sha but no line', () => {
    const lines = reportLines([cycle(FIRST, [uncovered()]), cycle(SECOND, [])], run(SECOND, true))
    expect(lines).toContain(
      `::error file=core/a.ts,title=uncovered-added-line::g1000000 ${MESSAGE}`,
    )
  })

  it('keeps the annotation of a finding with no file as the policy check writes it', () => {
    const finding = { rule: 'red-passes-before-green', message: 'RED tests pass', sha: FIRST }
    const lines = reportLines([cycle(FIRST, [finding])], run(SECOND, true))
    expect(lines).toContain('::error title=red-passes-before-green::g1000000 RED tests pass')
  })

  it('prints a guard warning under a proven cycle without failing the run', () => {
    const proven = { ...cycle(FIRST, [uncovered('uncovered-guard-line')]), status: 'proven' }
    const lines = reportLines([proven], run(FIRST))
    expect(lines[lines.length - 1]).toBe(
      `    [warn] [uncovered-guard-line] core/a.ts:7: ${MESSAGE}`,
    )
    expect(hasFailingFinding([proven])).toBe(false)
  })

  it('keeps the header unchanged when every cycle that needed mutation was reached', () => {
    const reached = { ...cycle(FIRST, []), status: 'proven', notes: ['no covered line'] }
    const lines = reportLines([reached], run(FIRST))
    expect(lines[0]).toBe('green:proof: 1 proven, 0 skipped, 0 failed in main..topic')
  })
})
