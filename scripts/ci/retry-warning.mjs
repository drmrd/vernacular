// scripts/ci/retry-warning.mjs
//
// Reads Playwright JSON reports and finds the tests that failed an attempt and
// then passed on a retry, so a green job can still say that it held a flake.

import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIRST_ERROR_MAX_LENGTH = 200
const ANSI_COLOR_CODES = /\u001b\[[0-9;]*m/g
const TITLE_SEPARATOR = ' > '

/**
 * @typedef {{ file: string, line: number, title: string, project: string, attempts: number, failedAttempts: number, firstError: string }} RetriedPass
 */

function collectSpecEntries(suite, describeTitles) {
  const nested = suite.suites ?? []
  return [
    ...(suite.specs ?? []).map((spec) => ({ spec, describeTitles })),
    ...nested.flatMap((child) => collectSpecEntries(child, [...describeTitles, child.title])),
  ]
}

function collectAllSpecEntries(report) {
  return report.suites.flatMap((fileSuite) => collectSpecEntries(fileSuite, []))
}

function firstErrorLine(failedResult) {
  const text = failedResult.error?.message ?? failedResult.error?.value ?? ''
  return text
    .replace(ANSI_COLOR_CODES, '')
    .split(/\r?\n|\r/)[0]
    .slice(0, FIRST_ERROR_MAX_LENGTH)
}

function repositoryPath(report, cwd, specFile) {
  const absoluteFile = path.join(report.config.rootDir, specFile)
  return path.relative(cwd, absoluteFile).split(path.sep).join('/')
}

function toRetriedPass({ spec, describeTitles }, test, file) {
  const failedResults = test.results.filter((result) => result.status !== 'passed')
  return {
    file,
    line: spec.line,
    title: [...describeTitles, spec.title].join(TITLE_SEPARATOR),
    project: test.projectName,
    attempts: test.results.length,
    failedAttempts: failedResults.length,
    firstError: firstErrorLine(failedResults[0]),
  }
}

/**
 * @param {object} report a Playwright JSON report
 * @param {string} cwd the repository root that file paths are made relative to
 * @returns {RetriedPass[]}
 */
export function findRetriedPasses(report, cwd) {
  return collectAllSpecEntries(report).flatMap((entry) => {
    const file = repositoryPath(report, cwd, entry.spec.file)
    return entry.spec.tests
      .filter((test) => test.status === 'flaky')
      .map((test) => toRetriedPass(entry, test, file))
  })
}

/**
 * @param {object} report a Playwright JSON report
 * @returns {number}
 */
export function countTests(report) {
  return collectAllSpecEntries(report).reduce((total, { spec }) => total + spec.tests.length, 0)
}

function escapeTableCell(text) {
  return text.replaceAll(/\r\n|\r|\n/g, ' ').replaceAll('|', '\\|')
}

function escapeAnnotationMessage(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function escapeAnnotationProperty(text) {
  return escapeAnnotationMessage(text).replaceAll(':', '%3A').replaceAll(',', '%2C')
}

function summaryTableRow(pass) {
  const location = escapeTableCell(`${pass.file}:${pass.line}`)
  const test = `\`${location}\` ${escapeTableCell(pass.title)}`
  const failed = `${pass.failedAttempts} of ${pass.attempts}`
  return `| ${test} | ${escapeTableCell(pass.project)} | ${failed} | ${escapeTableCell(pass.firstError)} |`
}

/**
 * @param {RetriedPass[]} passes
 * @param {{ tests: number, reports: number }} counts
 * @returns {string} Markdown for the job summary
 */
export function formatRetrySummary(passes, counts) {
  if (passes.length === 0) {
    return `Retry check: no test passed only on a retry. Tests read: ${counts.tests}. Reports read: ${counts.reports}.\n`
  }
  return [
    '### Warning: tests passed only on a retry',
    '',
    `Tests read: ${counts.tests}. Reports read: ${counts.reports}. Passed only on a retry: ${passes.length}.`,
    '',
    'Each of these tests failed and then passed on a retry, so the job stayed green. The report artifact of this job keeps the screenshot and the error of each failed attempt.',
    '',
    '| Test | Project | Failed attempts | First error |',
    '| --- | --- | --- | --- |',
    ...passes.map(summaryTableRow),
    '',
  ].join('\n')
}

/**
 * @param {RetriedPass[]} passes
 * @returns {string[]} workflow commands, one warning annotation for each pass
 */
export function formatRetryAnnotations(passes) {
  return passes.map((pass) => {
    const properties = `file=${escapeAnnotationProperty(pass.file)},line=${pass.line},title=Passed only on a retry`
    const message = `${pass.title} (${pass.project}) failed ${pass.failedAttempts} of ${pass.attempts} attempts: ${pass.firstError}`
    return `::warning ${properties}::${escapeAnnotationMessage(message)}`
  })
}

function describeCaught(error) {
  const [firstLine] = String(error?.message).split(/\r?\n|\r/)
  return ` (${firstLine.slice(0, FIRST_ERROR_MAX_LENGTH)})`
}

function warnCaught(log, problem, error) {
  log(`::warning title=Retry check::${escapeAnnotationMessage(problem + describeCaught(error))}`)
}

function isPlaywrightReport(value) {
  return Array.isArray(value?.suites) && typeof value.config?.rootDir === 'string'
}

function analyzeReport(report, cwd) {
  return { passes: findRetriedPasses(report, cwd), tests: countTests(report) }
}

function readReport(reportPath, deps) {
  const skip = (problem) => {
    const message = escapeAnnotationMessage(
      `${problem}, so its tests were not checked for retries.`,
    )
    deps.log(`::warning title=Retry check::${message}`)
    return undefined
  }
  let text
  try {
    text = deps.readFile(reportPath)
  } catch {
    return skip(`No Playwright JSON report at ${reportPath}`)
  }
  let report
  try {
    report = JSON.parse(text)
  } catch {
    return skip(`The Playwright JSON report at ${reportPath} is not valid JSON`)
  }
  if (!isPlaywrightReport(report)) {
    return skip(`The file at ${reportPath} is not a Playwright JSON report`)
  }
  try {
    return analyzeReport(report, deps.cwd)
  } catch (error) {
    return skip(
      `The Playwright JSON report at ${reportPath} could not be read${describeCaught(error)}`,
    )
  }
}

function formatSummaryOrWarn(passes, counts, log) {
  try {
    return formatRetrySummary(passes, counts)
  } catch (error) {
    warnCaught(log, 'Could not format the retry check result', error)
    return undefined
  }
}

function writeSummaryOrWarn(summary, deps, log) {
  try {
    deps.appendSummary(summary)
  } catch (error) {
    warnCaught(log, 'Could not write the job summary', error)
  }
}

function logAnnotation(pass, log) {
  try {
    log(formatRetryAnnotations([pass])[0])
  } catch (error) {
    warnCaught(log, 'Could not format a retry annotation', error)
  }
}

/**
 * Reads each report named in argv, writes the summary, and prints one annotation for each retry pass.
 * It always returns 0 so a retry pass leaves the job green.
 * @param {readonly string[]} argv paths of Playwright JSON reports
 * @param {{ readFile: (path: string) => string, appendSummary: (text: string) => void, log: (line: string) => void, cwd: string }} deps
 * @returns {Promise<number>}
 */
export async function runRetryWarning(argv, deps) {
  const log = (line) => {
    try {
      deps.log(line)
    } catch {
      // A broken log stream must not fail the job.
    }
  }
  const analyses = argv
    .map((reportPath) => readReport(reportPath, { ...deps, log }))
    .filter(Boolean)
  const passes = analyses.flatMap((analysis) => analysis.passes)
  const tests = analyses.reduce((total, analysis) => total + analysis.tests, 0)
  const summary = formatSummaryOrWarn(passes, { tests, reports: analyses.length }, log)
  if (summary !== undefined) {
    writeSummaryOrWarn(summary, deps, log)
  }
  passes.forEach((pass) => logAnnotation(pass, log))
  return 0
}

const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  runRetryWarning(process.argv.slice(2), {
    readFile: (reportPath) => readFileSync(reportPath, 'utf8'),
    appendSummary: (text) =>
      summaryPath === undefined ? process.stdout.write(text) : appendFileSync(summaryPath, text),
    log: (line) => console.log(line),
    cwd: process.cwd(),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 0
    })
}
