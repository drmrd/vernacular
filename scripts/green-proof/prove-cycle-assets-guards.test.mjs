import { describe, expect, it } from 'vitest'
import { report, scenario } from './green-proof-test-support.mjs'

const FIXTURES = 'core/x-test-fixtures.ts'

describe('proveCycle guards for assets-only RED commits', () => {
  it('stops when the related run for test assets writes no readable report', () => {
    const test = scenario({ reds: [[FIXTURES]], parent: 'not json', green: report('pass') })
    expect(() => test.run()).toThrow(/Vitest error at /)
  })

  it('stops when the GREEN run of the related tests collects no test file', () => {
    const test = scenario({ reds: [[FIXTURES]], parent: report('fail'), green: report('empty') })
    expect(() => test.run()).toThrow(/Vitest empty at /)
  })
})
