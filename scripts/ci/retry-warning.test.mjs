import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countTests, findRetriedPasses } from './retry-warning.mjs'

function readFixture(name) {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'))
}

const retried = readFixture('playwright-report-retried.json')
const clean = readFixture('playwright-report-clean.json')

describe('findRetriedPasses', () => {
  it('finds no retry pass in a report where every test passed on its first attempt', () => {
    expect(findRetriedPasses(clean, '/work')).toEqual([])
  })

  it('finds the test that failed its first attempt and passed on a retry', () => {
    expect(findRetriedPasses(retried, '/work')).toEqual([
      {
        file: 'e2e/tests/journeys/snap-along-wall.spec.ts',
        line: 8,
        title: 'plan canvas > snaps along a wall',
        project: 'chromium',
        attempts: 2,
        failedAttempts: 1,
        firstError: 'Error: expect(received).toBeGreaterThan(expected)',
      },
    ])
  })

  it('cuts a long first error to 200 characters', () => {
    const longError = structuredClone(retried)
    const flakyTest = longError.suites[0].suites[0].specs[0].tests[0]
    flakyTest.results[0].error.message = 'x'.repeat(500)
    const passes = findRetriedPasses(longError, '/work')
    expect(passes[0].firstError).toHaveLength(200)
  })
})

describe('countTests', () => {
  it('counts every test of every spec in nested suites', () => {
    expect(countTests(retried)).toBe(4)
    expect(countTests(clean)).toBe(1)
  })
})
