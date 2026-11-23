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
  return failedResult.error.message
    .replace(ANSI_COLOR_CODES, '')
    .split('\n')[0]
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
