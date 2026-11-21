import { describe, expect, it } from 'vitest'
import { readVitestRun, vitestArgs } from './vitest-run.mjs'

const ROOT = '/tmp/wt'

/** @param {object} overrides */
function report(overrides = {}) {
  return JSON.stringify({
    numTotalTestSuites: 1,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPassedTests: 1,
    testResults: [],
    ...overrides,
  })
}

describe('vitestArgs', () => {
  it('builds a unit run with JSON output and coverage for the changed files', () => {
    expect(
      vitestArgs({
        files: ['core/a.test.ts', 'scripts/b.test.mjs'],
        jsonFile: '/tmp/out.json',
        coverage: { include: ['core/a.ts', 'scripts/b.mjs'], dir: '/tmp/cov' },
      }),
    ).toEqual([
      'exec',
      'vitest',
      'run',
      '--project',
      'unit',
      '--reporter=json',
      '--outputFile=/tmp/out.json',
      '--coverage.enabled=true',
      '--coverage.provider=v8',
      '--coverage.reporter=lcovonly',
      '--coverage.reportsDirectory=/tmp/cov',
      '--coverage.include=core/a.ts',
      '--coverage.include=scripts/b.mjs',
      'core/a.test.ts',
      'scripts/b.test.mjs',
    ])
  })

  it('builds a related run for test assets', () => {
    expect(
      vitestArgs({ files: ['core/a-support.ts'], jsonFile: '/tmp/out.json', related: true }),
    ).toEqual([
      'exec',
      'vitest',
      'related',
      '--run',
      '--project',
      'unit',
      '--reporter=json',
      '--outputFile=/tmp/out.json',
      'core/a-support.ts',
    ])
  })
})

describe('readVitestRun', () => {
  it('reads a run with a failing test as failed', () => {
    const json = report({
      numFailedTests: 1,
      testResults: [
        {
          name: `${ROOT}/core/a.test.ts`,
          status: 'failed',
          message: '',
          assertionResults: [{ fullName: 'a does the thing', status: 'failed' }],
        },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.outcome).toBe('failed')
    expect(outcome.detail).toContain('a does the thing')
  })

  it('reads a file that does not load as failed', () => {
    const json = report({
      numFailedTestSuites: 1,
      testResults: [
        {
          name: `${ROOT}/core/x.test.ts`,
          status: 'failed',
          message: "Cannot find module './x'",
          assertionResults: [],
        },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.outcome).toBe('failed')
    expect(outcome.detail).toContain("Cannot find module './x'")
  })

  it('reads a run that collected no test file as empty, not failed', () => {
    // Review Focus 1: zero collected files is an internal error upstream, never "RED fails".
    const json = report({ numTotalTestSuites: 0 })
    expect(readVitestRun(1, json, ROOT).outcome).toBe('empty')
  })

  it('reads a missing or broken JSON report as an error', () => {
    expect(readVitestRun(0, '', ROOT).outcome).toBe('error')
    expect(readVitestRun(0, '{', ROOT).outcome).toBe('error')
  })

  it('gives a useful detail for a truncated report and for a crash with no report', () => {
    // Follows from the contract: error is never passed, whatever the exit status.
    const truncated = readVitestRun(0, '{"numTotalTestSuites": 1, "testRes', ROOT)
    expect(truncated).toEqual({
      outcome: 'error',
      testFiles: [],
      detail: expect.stringMatching(/\S/),
    })
    const crashed = readVitestRun(1, '', ROOT)
    expect(crashed).toEqual({
      outcome: 'error',
      testFiles: [],
      detail: expect.stringMatching(/\S/),
    })
  })

  it('lists the test files of the run relative to the worktree', () => {
    const json = report({
      numTotalTestSuites: 2,
      testResults: [
        { name: `${ROOT}/core/a.test.ts`, status: 'passed', message: '', assertionResults: [] },
        { name: `${ROOT}/scripts/b.test.mjs`, status: 'passed', message: '', assertionResults: [] },
      ],
    })
    expect(readVitestRun(0, json, ROOT)).toEqual({
      outcome: 'passed',
      testFiles: ['core/a.test.ts', 'scripts/b.test.mjs'],
      detail: expect.any(String),
    })
  })

  it('reports one failed and one passed file as failed with repository paths', () => {
    const json = report({
      numTotalTestSuites: 2,
      numFailedTests: 1,
      testResults: [
        {
          name: `${ROOT}/core/a.test.ts`,
          status: 'failed',
          message: '',
          assertionResults: [{ fullName: 'a fails', status: 'failed' }],
        },
        { name: `${ROOT}/core/b.test.ts`, status: 'passed', message: '', assertionResults: [] },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.outcome).toBe('failed')
    expect(outcome.testFiles).toEqual(['core/a.test.ts', 'core/b.test.ts'])
  })

  it('reads a nonzero exit with no failed test as failed with the exit status', () => {
    expect(readVitestRun(2, report(), ROOT)).toEqual({
      outcome: 'failed',
      testFiles: [],
      detail: 'Vitest exited 2',
    })
  })
})

describe('readVitestRun contract edges', () => {
  it.each(['null', '42', '[]'])('reads JSON that is not an object (%s) as an error', (text) => {
    const outcome = readVitestRun(0, text, ROOT)
    expect(outcome.outcome).toBe('error')
    expect(outcome.detail).toMatch(/\S/)
  })

  it.each(['numTotalTestSuites', 'numFailedTestSuites', 'numFailedTests', 'numPassedTests'])(
    'reads a report missing the %s field as an error',
    (field) => {
      const full = JSON.parse(report())
      delete full[field]
      const outcome = readVitestRun(0, JSON.stringify(full), ROOT)
      expect(outcome.outcome).toBe('error')
      expect(outcome.detail).toMatch(/\S/)
    },
  )

  it('reads a count field that is not a number as an error', () => {
    const outcome = readVitestRun(0, report({ numFailedTests: '0' }), ROOT)
    expect(outcome.outcome).toBe('error')
  })

  it.each([
    ['a negative count', { numFailedTests: -1 }],
    ['a fractional count', { numPassedTests: 1.5 }],
  ])('reads %s as an error, not passed', (_label, overrides) => {
    expect(readVitestRun(0, report(overrides), ROOT).outcome).toBe('error')
  })

  it.each([
    ['an empty object', {}],
    ['a string', 'x'],
  ])('reads testResults that is %s instead of an array as an error without throwing', (_l, bad) => {
    const outcome = readVitestRun(0, report({ testResults: bad }), ROOT)
    expect(outcome.outcome).toBe('error')
  })

  it('keeps the detail to at most 20 lines for a 30-line stack trace message', () => {
    const message = Array.from({ length: 30 }, (_, i) => `    at frame ${i}`).join('\n')
    const json = report({
      numFailedTestSuites: 1,
      testResults: [
        { name: `${ROOT}/core/a.test.ts`, status: 'failed', message, assertionResults: [] },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.detail.split('\n').length).toBeLessThanOrEqual(20)
  })

  it('gives failed assertions with no name or title a detail that is not blank and has the count', () => {
    const blank = { fullName: '', title: '', status: 'failed' }
    const json = report({
      numFailedTests: 2,
      testResults: [
        {
          name: `${ROOT}/core/a.test.ts`,
          status: 'failed',
          message: '',
          assertionResults: [blank, blank],
        },
      ],
    })
    const { detail } = readVitestRun(1, json, ROOT)
    expect(detail.trim()).not.toBe('')
    expect(detail).toContain('2')
  })

  it('reads a run where every test was skipped as empty, not passed', () => {
    const json = report({
      numTotalTestSuites: 1,
      numPassedTests: 0,
      testResults: [
        { name: `${ROOT}/core/a.test.ts`, status: 'skipped', message: '', assertionResults: [] },
      ],
    })
    expect(readVitestRun(0, json, ROOT).outcome).toBe('empty')
  })

  it('gives a failed suite with no message and no failed test a detail with the counts', () => {
    const json = report({
      numFailedTestSuites: 1,
      testResults: [
        { name: `${ROOT}/core/a.test.ts`, status: 'failed', message: '', assertionResults: [] },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.outcome).toBe('failed')
    expect(outcome.detail).toMatch(/\S/)
    expect(outcome.detail).toContain('1')
  })

  it('keeps the detail to at most 20 lines', () => {
    const assertionResults = Array.from({ length: 30 }, (_, i) => ({
      fullName: `case ${i}`,
      status: 'failed',
    }))
    const json = report({
      numFailedTests: 30,
      testResults: [
        { name: `${ROOT}/core/a.test.ts`, status: 'failed', message: '', assertionResults },
      ],
    })
    const outcome = readVitestRun(1, json, ROOT)
    expect(outcome.detail.split('\n').length).toBeLessThanOrEqual(20)
  })

  it('names a failing assertion by its title when it has no full name', () => {
    const json = report({
      numFailedTests: 1,
      testResults: [
        {
          name: `${ROOT}/core/a.test.ts`,
          status: 'failed',
          message: '',
          assertionResults: [{ title: 'only a title', status: 'failed' }],
        },
      ],
    })
    expect(readVitestRun(1, json, ROOT).detail).toContain('only a title')
  })
})
