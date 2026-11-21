/**
 * Builds the Vitest command line of a GREEN proof run and reads its JSON report.
 */

import { repositoryPath } from './coverage.mjs'

/** @typedef {{ outcome: 'passed'|'failed'|'empty'|'error', testFiles: string[], detail: string }} VitestOutcome */

const MAX_DETAIL_LINES = 20

/**
 * @param {{ include: string[], dir: string }} coverage
 * @returns {string[]}
 */
function coverageArgs(coverage) {
  return [
    '--coverage.enabled=true',
    '--coverage.provider=v8',
    '--coverage.reporter=lcovonly',
    `--coverage.reportsDirectory=${coverage.dir}`,
    ...coverage.include.map((path) => `--coverage.include=${path}`),
  ]
}

/**
 * @param {{ files: string[], jsonFile: string, related?: boolean, coverage?: { include: string[], dir: string } }} request
 * @returns {string[]} the arguments after `pnpm`
 */
export function vitestArgs(request) {
  const mode = request.related ? ['related', '--run'] : ['run']
  return [
    'exec',
    'vitest',
    ...mode,
    '--project',
    'unit',
    '--reporter=json',
    `--outputFile=${request.jsonFile}`,
    ...(request.coverage ? coverageArgs(request.coverage) : []),
    ...request.files,
  ]
}

/**
 * @param {any} report
 * @returns {string[]}
 */
function failureLines(report) {
  /** @type {string[]} */
  const entries = []
  for (const file of report.testResults) {
    if (file.status === 'failed' && file.message) entries.push(`${file.name}: ${file.message}`)
    for (const test of file.assertionResults ?? []) {
      if (test.status === 'failed') entries.push(`${test.fullName || test.title || ''}`)
    }
  }
  return entries
    .filter((entry) => entry.trim() !== '')
    .flatMap((entry) => entry.split('\n'))
    .slice(0, MAX_DETAIL_LINES)
}

const REPORT_COUNT_FIELDS = [
  'numTotalTestSuites',
  'numFailedTestSuites',
  'numFailedTests',
  'numPassedTests',
]

/**
 * @param {string} message
 * @returns {VitestOutcome}
 */
function errorOutcome(message) {
  return { outcome: 'error', testFiles: [], detail: message }
}

/**
 * @param {string} jsonText
 * @returns {{ report: any } | { error: VitestOutcome }}
 */
function parseReport(jsonText) {
  /** @type {any} */
  let report
  try {
    report = JSON.parse(jsonText)
  } catch {
    return { error: errorOutcome('Vitest wrote no readable JSON report') }
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return { error: errorOutcome('Vitest JSON report is not an object') }
  }
  const missing = REPORT_COUNT_FIELDS.filter(
    (field) => !Number.isInteger(report[field]) || report[field] < 0,
  )
  if (missing.length > 0) {
    return {
      error: errorOutcome(`Vitest JSON report lacks non-negative integer ${missing.join(', ')}`),
    }
  }
  if (!Array.isArray(report.testResults)) {
    return { error: errorOutcome('Vitest JSON report lacks a testResults array') }
  }
  return { report }
}

/**
 * @param {any} report
 * @returns {string}
 */
function failureDetail(report) {
  const lines = failureLines(report).join('\n')
  if (lines !== '') return lines
  const suites = report.numFailedTestSuites === 1 ? 'suite' : 'suites'
  const tests = report.numFailedTests === 1 ? 'test' : 'tests'
  return `${report.numFailedTestSuites} failed ${suites}, ${report.numFailedTests} failed ${tests}`
}

/**
 * @param {number} status exit status of the Vitest process
 * @param {string} jsonText the JSON report text
 * @param {string} root absolute worktree root
 * @returns {VitestOutcome}
 */
export function readVitestRun(status, jsonText, root) {
  const parsed = parseReport(jsonText)
  if ('error' in parsed) return parsed.error
  const { report } = parsed
  const testFiles = report.testResults.map((/** @type {any} */ file) =>
    repositoryPath(String(file.name), root),
  )
  const failed = report.numFailedTests + report.numFailedTestSuites
  if (report.numTotalTestSuites === 0 || (failed === 0 && report.numPassedTests === 0)) {
    return { outcome: 'empty', testFiles, detail: 'Vitest ran no test' }
  }
  if (failed > 0) {
    return { outcome: 'failed', testFiles, detail: failureDetail(report) }
  }
  if (status !== 0) {
    return { outcome: 'failed', testFiles, detail: `Vitest exited ${status}` }
  }
  return { outcome: 'passed', testFiles, detail: '' }
}
