import { describe, expect, it } from 'vitest'
import { GREEN, PARENT, ROOT, report, scenario } from './green-proof-test-support.mjs'

const TYPE_ERROR = "core/a.test.ts(3,9): error TS2345: Argument of type 'string' is not assignable."

describe('proveCycle', () => {
  it('proves a cycle whose RED test fails at the parent and passes at GREEN', () => {
    const result = scenario({ parent: report('fail'), green: report('pass') }).run()
    expect(result).toMatchObject({ sha: GREEN, status: 'proven', findings: [], reason: '' })
    expect(Object.keys(result.timings).sort()).toEqual(expect.arrayContaining(['green', 'parent']))
    expect(result.timings).not.toHaveProperty('typeCheck')
  })

  it('counts a RED file that does not load at the parent as failing', () => {
    const result = scenario({ parent: report('noload'), green: report('pass') }).run()
    expect(result.status).toBe('proven')
    expect(result.findings).toEqual([])
  })

  it('counts a type error in a RED file as failing when the parent run passes', () => {
    const test = scenario({
      parent: report('pass'),
      green: report('pass'),
      tsc: { status: 2, stdout: TYPE_ERROR },
    })
    const result = test.run()
    expect(result.status).toBe('proven')
    expect(result.findings).toEqual([])
    expect(test.tscCalls()).toHaveLength(1)
  })

  it('fails a cycle whose RED tests pass and type-check at the parent', () => {
    const result = scenario({ parent: report('pass'), green: report('pass') }).run()
    expect(result.status).toBe('failed')
    expect(result.findings).toEqual([
      {
        rule: 'red-passes-before-green',
        sha: GREEN,
        message: 'RED tests pass and type-check at the parent parent12: core/a.test.ts',
      },
    ])
  })

  it('fails a cycle whose RED tests do not pass at GREEN', () => {
    const result = scenario({ parent: report('fail'), green: report('fail') }).run()
    expect(result.status).toBe('failed')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ rule: 'red-fails-at-green', sha: GREEN })
    expect(result.findings[0].message).toContain('RED tests do not pass at the GREEN commit:')
    expect(result.findings[0].message).toContain('a rejects bad input')
  })

  it('reports check 1 as a warning for a mixed set but still fails on check 2', () => {
    const reds = [['core/a.test.ts', 'e2e/tests/a.spec.ts']]
    const passing = scenario({ reds, parent: report('pass'), green: report('pass') }).run()
    expect(passing.status).toBe('proven')
    expect(passing.findings.map((f) => f.rule)).toEqual(['mixed-red-passes-before-green'])
    const failing = scenario({ reds, parent: report('fail'), green: report('fail') }).run()
    expect(failing.status).toBe('failed')
    expect(failing.findings.map((f) => f.rule)).toEqual(['red-fails-at-green'])
  })

  it.each([
    ['has no RED pool', [], 'no RED commit before this GREEN commit'],
    [
      'has only end-to-end tests',
      [['e2e/tests/a.spec.ts']],
      'RED tests are only end-to-end, browser, or story tests: e2e/tests/a.spec.ts',
    ],
  ])('skips a cycle that %s, without a checkout', (_name, reds, reason) => {
    const test = scenario({ reds })
    const result = test.run()
    expect(result).toMatchObject({ status: 'skipped', reason, findings: [] })
    expect(result.timings).toEqual({})
    expect(test.state.checkouts).toEqual([])
    expect(test.vitestCalls()).toEqual([])
  })

  it('skips a cycle whose RED test files are all gone at the GREEN commit, without a checkout', () => {
    const test = scenario({ gone: ['core/a.test.ts'] })
    const result = test.run()
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'the RED commits leave no test file at this commit',
    })
    expect(test.state.checkouts).toEqual([])
  })

  it('runs the parent first and the GREEN commit second, in the worktree', () => {
    const test = scenario({ parent: report('fail'), green: report('pass') })
    test.run()
    expect(test.state.checkouts).toEqual([PARENT, GREEN])
    expect(test.vitestCalls().map((c) => c.options.cwd)).toEqual([ROOT, ROOT])
  })
})
