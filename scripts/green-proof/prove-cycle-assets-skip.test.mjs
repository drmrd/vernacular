import { describe, expect, it } from 'vitest'
import { report, scenario } from './green-proof-test-support.mjs'

const FIXTURES = 'core/x-test-fixtures.ts'

describe('proveCycle with RED commits that change only test assets', () => {
  it('skips a cycle whose RED commits change only test assets', () => {
    const test = scenario({ reds: [[FIXTURES]], parent: report('empty'), green: report('pass') })
    const result = test.run()
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe(`no unit test imports the RED test assets: ${FIXTURES}`)
  })
})
