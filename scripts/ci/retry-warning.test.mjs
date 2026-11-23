import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  countTests,
  findRetriedPasses,
  formatRetryAnnotations,
  formatRetrySummary,
  runRetryWarning,
} from './retry-warning.mjs'

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

  it('reads the first error of a failed attempt that threw a value that is not an Error', () => {
    const report = structuredClone(retried)
    report.suites[0].suites[0].specs[0].tests[0].results[0].error = { value: "'boom'" }
    expect(findRetriedPasses(report, '/work')[0].firstError).toBe("'boom'")
  })

  it('gives an empty first error when the failed attempt has no error', () => {
    const report = structuredClone(retried)
    delete report.suites[0].suites[0].specs[0].tests[0].results[0].error
    expect(findRetriedPasses(report, '/work')[0].firstError).toBe('')
  })
})

describe('countTests', () => {
  it('counts every test of every spec in nested suites', () => {
    expect(countTests(retried)).toBe(4)
    expect(countTests(clean)).toBe(1)
  })
})

const retryPass = {
  file: 'e2e/tests/journeys/snap-along-wall.spec.ts',
  line: 4,
  title: 'snaps along a wall',
  project: 'chromium',
  attempts: 2,
  failedAttempts: 1,
  firstError: 'expected "Snapped to edge"',
}

describe('formatRetrySummary', () => {
  it('writes one line when no test passed only on a retry', () => {
    expect(formatRetrySummary([], { tests: 412, reports: 1 })).toBe(
      'Retry check: no test passed only on a retry. Tests read: 412. Reports read: 1.\n',
    )
  })

  it('writes a warning heading and one table row for each retry pass', () => {
    const text = formatRetrySummary([retryPass], { tests: 412, reports: 1 })
    expect(text).toBe(
      [
        '### Warning: tests passed only on a retry',
        '',
        'Tests read: 412. Reports read: 1. Passed only on a retry: 1.',
        '',
        'Each of these tests failed and then passed on a retry, so the job stayed green. The report artifact of this job keeps the screenshot and the error of each failed attempt.',
        '',
        '| Test | Project | Failed attempts | First error |',
        '| --- | --- | --- | --- |',
        '| `e2e/tests/journeys/snap-along-wall.spec.ts:4` snaps along a wall | chromium | 1 of 2 | expected "Snapped to edge" |',
        '',
      ].join('\n'),
    )
  })

  it('escapes a pipe in a title or an error so the table keeps its columns', () => {
    const text = formatRetrySummary([{ ...retryPass, title: 'a | b', firstError: 'c | d' }], {
      tests: 412,
      reports: 1,
    })
    expect(text).toContain('a \\| b')
    expect(text).toContain('c \\| d')
  })

  it('keeps a title that holds a newline on one table row', () => {
    const text = formatRetrySummary([{ ...retryPass, title: 'first line\nsecond line' }], {
      tests: 412,
      reports: 1,
    })
    const rows = text.split('\n').filter((line) => line.startsWith('| `'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('first line second line')
  })

  it('escapes a pipe in the file and in the project so the table keeps its columns', () => {
    const text = formatRetrySummary(
      [{ ...retryPass, file: 'e2e/tests/a|b.spec.ts', project: 'x|y' }],
      { tests: 412, reports: 1 },
    )
    expect(text).toContain('e2e/tests/a\\|b.spec.ts:4')
    expect(text).toContain('| x\\|y |')
  })
})

describe('formatRetryAnnotations', () => {
  it('writes one warning annotation for each retry pass', () => {
    expect(formatRetryAnnotations([retryPass])).toEqual([
      '::warning file=e2e/tests/journeys/snap-along-wall.spec.ts,line=4,title=Passed only on a retry::snaps along a wall (chromium) failed 1 of 2 attempts: expected "Snapped to edge"',
    ])
  })

  it('encodes the characters that a workflow command reserves', () => {
    const [line] = formatRetryAnnotations([
      { ...retryPass, title: '50% done\nnext', file: 'e2e/tests/a,b:c.spec.ts' },
    ])
    expect(line).toContain('file=e2e/tests/a%2Cb%3Ac.spec.ts,')
    expect(line).toContain('::50%25 done%0Anext (')
  })

  it('encodes a carriage return in the message', () => {
    const [line] = formatRetryAnnotations([{ ...retryPass, title: 'first\rsecond' }])
    expect(line).toContain('::first%0Dsecond (')
  })

  it('encodes a percent sign, a carriage return, and a newline in a property value', () => {
    const [line] = formatRetryAnnotations([{ ...retryPass, file: 'e2e/tests/100%\r\n.spec.ts' }])
    expect(line).toContain('file=e2e/tests/100%25%0D%0A.spec.ts,')
  })
})

function fakeDeps(files) {
  return {
    readFile: (path) => {
      if (!(path in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files[path]
    },
    appendSummary: vi.fn(),
    log: vi.fn(),
    cwd: '/work',
  }
}

const noRetryNote = 'Retry check: no test passed only on a retry. Tests read: 1. Reports read: 1.\n'

describe('runRetryWarning', () => {
  it('appends the warning to the job summary and exits 0 when a test passed only on a retry', async () => {
    const deps = fakeDeps({ 'a.json': JSON.stringify(retried) })
    expect(await runRetryWarning(['a.json'], deps)).toBe(0)
    expect(deps.appendSummary).toHaveBeenCalledOnce()
    expect(deps.appendSummary.mock.calls[0][0]).toContain(
      '### Warning: tests passed only on a retry',
    )
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringMatching(/^::warning file=e2e\/tests\/journeys\/snap-along-wall\.spec\.ts,/),
    )
  })

  it('adds up the tests and the retry passes of several reports', async () => {
    const deps = fakeDeps({ 'a.json': JSON.stringify(retried), 'b.json': JSON.stringify(clean) })
    await runRetryWarning(['a.json', 'b.json'], deps)
    expect(deps.appendSummary.mock.calls[0][0]).toContain(
      'Tests read: 5. Reports read: 2. Passed only on a retry: 1.',
    )
  })

  it('writes the one-line note and exits 0 when no test passed only on a retry', async () => {
    const deps = fakeDeps({ 'b.json': JSON.stringify(clean) })
    expect(await runRetryWarning(['b.json'], deps)).toBe(0)
    expect(deps.appendSummary).toHaveBeenCalledWith(noRetryNote)
    expect(deps.log).not.toHaveBeenCalled()
  })

  it('warns and exits 0 when a report file is missing', async () => {
    const deps = fakeDeps({ 'b.json': JSON.stringify(clean) })
    expect(await runRetryWarning(['missing.json', 'b.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(
      '::warning title=Retry check::No Playwright JSON report at missing.json, so its tests were not checked for retries.',
    )
    expect(deps.appendSummary).toHaveBeenCalledWith(noRetryNote)
  })

  it('names the parse failure when a report file exists but is not valid JSON', async () => {
    const deps = fakeDeps({ 'broken.json': '{"suites": [', 'b.json': JSON.stringify(clean) })
    expect(await runRetryWarning(['broken.json', 'b.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(
      '::warning title=Retry check::The Playwright JSON report at broken.json is not valid JSON, so its tests were not checked for retries.',
    )
    expect(deps.log).not.toHaveBeenCalledWith(expect.stringContaining('No Playwright JSON report'))
    expect(deps.appendSummary).toHaveBeenCalledWith(noRetryNote)
  })

  const notAReportWarning =
    '::warning title=Retry check::The file at odd.json is not a Playwright JSON report, so its tests were not checked for retries.'
  const withoutRootDir = { ...structuredClone(retried), config: {} }

  it.each([
    ['an empty object', '{}'],
    ['a bare string', '"x"'],
    ['a null value', 'null'],
    ['a report without config.rootDir', JSON.stringify(withoutRootDir)],
  ])('warns and exits 0 when a report file holds %s', async (_label, content) => {
    const deps = fakeDeps({ 'odd.json': content, 'b.json': JSON.stringify(clean) })
    expect(await runRetryWarning(['odd.json', 'b.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(notAReportWarning)
    expect(deps.appendSummary).toHaveBeenCalledWith(noRetryNote)
  })

  it('warns and exits 0 when the job summary cannot be written', async () => {
    const deps = fakeDeps({ 'b.json': JSON.stringify(clean) })
    deps.appendSummary.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })
    expect(await runRetryWarning(['b.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(
      '::warning title=Retry check::Could not write the job summary, so the retry check result is missing from it.',
    )
  })
})
