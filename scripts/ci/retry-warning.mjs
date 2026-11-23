// scripts/ci/retry-warning.mjs
//
// Reads Playwright JSON reports and finds the tests that failed an attempt and
// then passed on a retry, so a green job can still say that it held a flake.

import path from 'node:path'

const FIRST_ERROR_MAX_LENGTH = 200
const ANSI_COLOR_CODES = /\u001b\[[0-9;]*m/g
const TITLE_SEPARATOR = ' > '

/**
 * @typedef {{ file: string, line: number, title: string, project: string, attempts: number, failedAttempts: number, firstError: string }} RetriedPass
 */

function collectSpecs(suite, describeTitles) {
  const nested = suite.suites ?? []
  return [
    ...(suite.specs ?? []).map((spec) => ({ spec, describeTitles })),
    ...nested.flatMap((child) => collectSpecs(child, [...describeTitles, child.title])),
  ]
}

function collectAllSpecs(report) {
  return report.suites.flatMap((fileSuite) => collectSpecs(fileSuite, []))
}

function firstErrorLine(failedResult) {
  return failedResult.error.message
    .replace(ANSI_COLOR_CODES, '')
    .split('\n')[0]
    .slice(0, FIRST_ERROR_MAX_LENGTH)
}

function toRetriedPass(report, cwd, { spec, describeTitles }, test) {
  const failedResults = test.results.filter((result) => result.status !== 'passed')
  const absoluteFile = path.join(report.config.rootDir, spec.file)
  return {
    file: path.relative(cwd, absoluteFile).split(path.sep).join('/'),
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
  return collectAllSpecs(report).flatMap((entry) =>
    entry.spec.tests
      .filter((test) => test.status === 'flaky')
      .map((test) => toRetriedPass(report, cwd, entry, test)),
  )
}

/**
 * @param {object} report a Playwright JSON report
 * @returns {number}
 */
export function countTests(report) {
  return collectAllSpecs(report).reduce((total, { spec }) => total + spec.tests.length, 0)
}
