/**
 * Output of the green:proof command: the header, one block per cycle, and the findings.
 */

import { formatAnnotation, formatPlainLine } from '../policy-check/report.mjs'
import { severityOf } from '../policy-check/rule-severity.mjs'

/**
 * @typedef {import('./prove-cycle.mjs').CycleResult} CycleResult
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 */

const SHORT_SHA_LENGTH = 8
const MILLISECONDS_PER_SECOND = 1000
const TIMED_STEPS = /** @type {const} */ ([
  ['install', 'install'],
  ['parent', 'parent'],
  ['typeCheck', 'type-check'],
  ['green', 'green'],
  ['mutation', 'mutation'],
])

/**
 * @param {string} sha
 * @returns {string}
 */
export function shortSha(sha) {
  return sha.slice(0, SHORT_SHA_LENGTH)
}

/**
 * @param {CycleResult} result
 * @returns {string[]}
 */
function cycleLines(result) {
  const reason = result.status === 'skipped' ? ` (${result.reason})` : ''
  const lines = [`  ${shortSha(result.sha)} ${result.status} ${result.title}${reason}`]
  for (const note of result.notes) lines.push(`    note: ${note}`)
  if (result.status !== 'skipped') lines.push(timingLine(result.timings))
  return lines
}

/**
 * @param {CycleResult['timings']} timings
 * @returns {string}
 */
function timingLine(timings) {
  const parts = TIMED_STEPS.map(([step, label]) => {
    const seconds = (timings[step] ?? 0) / MILLISECONDS_PER_SECOND
    return `${label} ${seconds.toFixed(1)} s`
  })
  return `    time: ${parts.join(', ')}`
}

/**
 * Failing findings first, then warnings; each group keeps its order.
 * @param {CycleResult[]} results
 * @returns {{ finding: Finding, severity: 'fail'|'warn' }[]}
 */
function sortedFindings(results) {
  const all = results
    .flatMap((result) => result.findings)
    .map((finding) => ({ finding, severity: severityOf(finding.rule) }))
  return [
    ...all.filter((entry) => entry.severity === 'fail'),
    ...all.filter((entry) => entry.severity !== 'fail'),
  ]
}

/**
 * @param {CycleResult[]} results
 * @returns {boolean} true when a finding fails the run
 */
export function hasFailingFinding(results) {
  return sortedFindings(results).some((entry) => entry.severity === 'fail')
}

/**
 * @param {CycleResult[]} results
 * @param {string} range
 * @param {boolean} githubActions
 * @returns {string[]} the output lines
 */
export function reportLines(results, range, githubActions) {
  const count = (status) => results.filter((result) => result.status === status).length
  const header = `green:proof: ${count('proven')} proven, ${count('skipped')} skipped, ${count('failed')} failed in ${range}`
  const format = githubActions ? formatAnnotation : formatPlainLine
  return [
    header,
    ...results.flatMap(cycleLines),
    ...sortedFindings(results).map(({ finding, severity }) => format(finding, severity)),
  ]
}
