import { describe, expect, it } from 'vitest'
import { report, reportOf, scenario } from './green-proof-test-support.mjs'

const AT_PARENT = /parent12(?![0-9])/
const AT_GREEN = /green123(?![0-9])/

/** A pattern that matches only text containing every part. */
const mentioning = (...parts) =>
  new RegExp(`^(?=[\\s\\S]*${parts.map((part) => part.source).join(')(?=[\\s\\S]*')})`)

const A = 'core/a.test.ts'
const B = 'core/b.test.ts'
const EXTRA = 'core/a.test.tsx'

describe('proveCycle internal errors', () => {
  it('stops when Vitest collects no test file at the parent', () => {
    const test = scenario({ parent: report('empty'), green: report('pass') })
    expect(() => test.run()).toThrow(mentioning(/Vitest empty/, AT_PARENT))
  })

  it('stops when Vitest collects no test file at the GREEN commit', () => {
    const test = scenario({ parent: report('fail'), green: report('empty') })
    expect(() => test.run()).toThrow(mentioning(/Vitest empty/, AT_GREEN))
  })

  it('stops when the GREEN run writes no readable report', () => {
    const test = scenario({ parent: report('fail'), green: 'not json' })
    expect(() => test.run()).toThrow(mentioning(/Vitest error/, AT_GREEN))
  })

  it('does not read a stale parent report as the result of the GREEN run', () => {
    const test = scenario({ parent: report('fail'), green: { exit: 0 } })
    expect(() => test.run()).toThrow(AT_GREEN)
  })

  it('stops when the tsc config cannot be shown', () => {
    const test = scenario({ parent: report('pass'), green: report('pass'), showConfig: 'not json' })
    expect(() => test.run()).toThrow(mentioning(/tsc --showConfig gave no file list/, AT_PARENT))
  })

  it('stops when tsc fails without a located error', () => {
    const test = scenario({
      parent: report('pass'),
      green: report('pass'),
      tsc: { status: 1, stdout: "error TS5083: Cannot read file 'tsconfig.json'." },
    })
    expect(() => test.run()).toThrow(mentioning(/tsc failed/, /TS5083/, AT_PARENT))
  })
})

describe('proveCycle test-file set guards', () => {
  it('stops when a run leaves out one of the RED files', () => {
    const test = scenario({
      reds: [[A, B]],
      parent: reportOf([[A, 'fail']]),
      green: report('pass'),
    })
    expect(() => test.run()).toThrow(
      mentioning(/different set of test files/, AT_PARENT, /missing \[core\/b\.test\.ts\]/),
    )
  })

  it('stops when a run holds an extra file that alone fails at the parent', () => {
    const parent = reportOf([
      [A, 'pass'],
      [EXTRA, 'fail'],
    ])
    const test = scenario({ parent, green: report('pass') })
    expect(() => test.run()).toThrow(
      mentioning(/different set of test files/, AT_PARENT, /extra \[core\/a\.test\.tsx\]/),
    )
  })
})

describe('proveCycle with a non-ASCII RED path', () => {
  it('runs a RED file whose name Git would otherwise quote', () => {
    const file = 'core/fenêtre.test.ts'
    const test = scenario({
      reds: [[file]],
      parent: report('fail', file),
      green: report('pass', file),
    })
    const result = test.run()
    expect(result).toMatchObject({ status: 'proven', findings: [] })
    expect(test.vitestCalls().map((call) => call.args)).toEqual([
      expect.arrayContaining([file]),
      expect.arrayContaining([file]),
    ])
  })
})
