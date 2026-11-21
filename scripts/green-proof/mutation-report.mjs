/**
 * Reads a Stryker JSON report and turns surviving mutants into findings.
 */

import { repositoryPath } from './coverage.mjs'

/** @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding */

const REPORTED_STATUS_TEXT = new Map([
  ['Survived', 'survives the RED tests'],
  ['NoCoverage', 'runs no RED test'],
])

/** @param {string} reason */
function reportError(reason) {
  return new Error(`Stryker report: ${reason}`)
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {string} reportJson */
function parseReport(reportJson) {
  try {
    return JSON.parse(reportJson)
  } catch (error) {
    throw reportError(`not JSON (${error})`)
  }
}

/**
 * @param {string} reportJson
 * @returns {Record<string, unknown>}
 */
function readFiles(reportJson) {
  const report = parseReport(reportJson)
  if (!isPlainObject(report)) throw reportError('not a JSON object')
  const files = report.files
  if (!isPlainObject(files)) throw reportError('files is not an object')
  return files
}

/**
 * @param {string} path
 * @param {unknown} entry
 * @returns {unknown[]}
 */
function mutantsOf(path, entry) {
  if (!isPlainObject(entry) || !Array.isArray(entry.mutants)) {
    throw reportError(`${path} has no mutants array`)
  }
  return entry.mutants
}

/**
 * @param {string} path
 * @param {Record<string, any>} mutant
 * @returns {number}
 */
function startLine(path, mutant) {
  const line = mutant.location?.start?.line
  if (!Number.isInteger(line) || line < 1) {
    throw reportError(`${path} has a mutant without a valid start line`)
  }
  return line
}

/**
 * @param {string} reportJson the Stryker JSON report text
 * @param {{ sha: string, root: string }} context
 * @returns {Finding[]}
 */
export function survivorFindings(reportJson, { sha, root }) {
  /** @type {Finding[]} */
  const findings = []
  for (const [path, entry] of Object.entries(readFiles(reportJson))) {
    const file = repositoryPath(path, root)
    for (const mutant of mutantsOf(path, entry)) {
      if (!isPlainObject(mutant)) throw reportError(`${path} has a mutant that is not an object`)
      const statusText = REPORTED_STATUS_TEXT.get(mutant.status)
      if (statusText === undefined) continue
      const replacement = typeof mutant.replacement === 'string' ? `: ${mutant.replacement}` : ''
      findings.push({
        rule: 'surviving-mutant',
        sha,
        file,
        line: startLine(path, mutant),
        message: `${mutant.mutatorName} mutant ${statusText}${replacement}`,
      })
    }
  }
  return findings
}
