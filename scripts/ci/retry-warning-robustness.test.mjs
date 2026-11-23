import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { findRetriedPasses, formatRetrySummary, runRetryWarning } from './retry-warning.mjs'

function readFixture(name) {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'))
}

const retried = readFixture('playwright-report-retried.json')
const clean = readFixture('playwright-report-clean.json')

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

function mutatedReport(mutate) {
  const report = structuredClone(retried)
  const spec = report.suites[0].suites[0].specs[0]
  mutate(report, spec, spec.tests[0])
  return JSON.stringify(report)
}

const noRetryNote = 'Retry check: no test passed only on a retry. Tests read: 1. Reports read: 1.\n'
const notAReportWarning =
  '::warning title=Retry check::The file at odd.json is not a Playwright JSON report, so its tests were not checked for retries.'

describe('runRetryWarning on a report that is malformed below the top level', () => {
  it.each([
    [
      'a suites list that holds null',
      mutatedReport((report) => {
        report.suites = [null]
      }),
    ],
    [
      'a spec whose tests are null',
      mutatedReport((_report, spec) => {
        spec.tests = null
      }),
    ],
    [
      'a spec without a file',
      mutatedReport((_report, spec) => {
        delete spec.file
      }),
    ],
    [
      'a flaky test whose results all passed',
      mutatedReport((_report, _spec, test) => {
        test.results = test.results.filter((result) => result.status === 'passed')
      }),
    ],
    [
      'a failed result whose error message is a number',
      mutatedReport((_report, _spec, test) => {
        test.results[0].error.message = 42
      }),
    ],
  ])(
    'warns, exits 0, and still counts a good report when a report file holds %s',
    async (_label, content) => {
      const deps = fakeDeps({ 'odd.json': content, 'b.json': JSON.stringify(clean) })
      expect(await runRetryWarning(['odd.json', 'b.json'], deps)).toBe(0)
      expect(deps.log).toHaveBeenCalledWith(notAReportWarning)
      expect(deps.appendSummary).toHaveBeenCalledWith(noRetryNote)
    },
  )

  it('warns that the file is not a report when the report has no config key at all', async () => {
    const withoutConfig = structuredClone(retried)
    delete withoutConfig.config
    const deps = fakeDeps({ 'odd.json': JSON.stringify(withoutConfig) })
    expect(await runRetryWarning(['odd.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(notAReportWarning)
  })
})

describe('runRetryWarning when the log dependency throws', () => {
  it.each([
    ['a report file is missing', {}, ['missing.json']],
    ['a test passed only on a retry', { 'a.json': JSON.stringify(retried) }, ['a.json']],
  ])('exits 0 when logging fails and %s', async (_label, files, argv) => {
    const deps = fakeDeps(files)
    deps.log.mockImplementation(() => {
      throw new Error('EPIPE: broken pipe')
    })
    expect(await runRetryWarning(argv, deps)).toBe(0)
  })
})

describe('runRetryWarning when the summary cannot be formatted', () => {
  it('names the formatting failure instead of blaming the summary write', async () => {
    const withoutProject = JSON.parse(
      mutatedReport((_report, _spec, test) => {
        delete test.projectName
      }),
    )
    const deps = fakeDeps({ 'a.json': JSON.stringify(withoutProject) })
    expect(await runRetryWarning(['a.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(
      '::warning title=Retry check::Could not format the retry check result, so it is missing from the job summary.',
    )
    expect(deps.log).not.toHaveBeenCalledWith(expect.stringContaining('Could not write'))
  })
})

describe('runRetryWarning when the job summary cannot be written', () => {
  it('exits 0 and warns that the summary was not written', async () => {
    const deps = fakeDeps({ 'a.json': JSON.stringify(clean) })
    deps.appendSummary.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })
    expect(await runRetryWarning(['a.json'], deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining('Could not write the job summary'),
    )
  })
})

describe('runRetryWarning with a report path that holds reserved characters', () => {
  it('encodes a percent sign, a carriage return, and a newline in the warning', async () => {
    const deps = fakeDeps({})
    await runRetryWarning(['a%b\r\nc'], deps)
    expect(deps.log).toHaveBeenCalledWith(
      '::warning title=Retry check::No Playwright JSON report at a%25b%0D%0Ac, so its tests were not checked for retries.',
    )
  })
})

describe('carriage returns in report text', () => {
  const counts = { tests: 412, reports: 1 }
  const retryPass = {
    file: 'e2e/tests/journeys/snap-along-wall.spec.ts',
    line: 4,
    title: 'snaps along a wall',
    project: 'chromium',
    attempts: 2,
    failedAttempts: 1,
    firstError: 'expected',
  }

  it('keeps a title that holds a carriage return on one table row', () => {
    const text = formatRetrySummary([{ ...retryPass, title: 'first\rsecond' }], counts)
    expect(text).not.toContain('\r')
    expect(text.split('\n').filter((line) => line.startsWith('| `'))).toHaveLength(1)
    expect(text).toContain('first second')
  })

  it('reads only the first line of an error message that uses carriage return and newline', () => {
    const report = JSON.parse(
      mutatedReport((_report, _spec, test) => {
        test.results[0].error.message = 'first line\r\nsecond line'
      }),
    )
    expect(findRetriedPasses(report, '/work')[0].firstError).toBe('first line')
  })
})

describe('running the script file directly', () => {
  const scriptPath = join(import.meta.dirname, 'retry-warning.mjs')
  const scratch = mkdtempSync(join(tmpdir(), 'retry-warning-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  function exitStatusFor(argument) {
    const env = { ...process.env }
    delete env.GITHUB_STEP_SUMMARY
    return spawnSync(process.execPath, [scriptPath, argument], { env, encoding: 'utf8' }).status
  }

  it('exits 0 when the report holds a shape the walk cannot read', () => {
    const reportPath = join(scratch, 'bad-shape.json')
    writeFileSync(
      reportPath,
      mutatedReport((report) => {
        report.suites = [null]
      }),
    )
    expect(exitStatusFor(reportPath)).toBe(0)
  })

  it('exits 0 when the report path does not exist', () => {
    expect(exitStatusFor(join(scratch, 'missing.json'))).toBe(0)
  })
})
