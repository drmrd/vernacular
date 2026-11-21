/**
 * Output of the green:proof command: the header, then one block per cycle with that cycle's findings.
 */

import { formatAnnotation, formatPlainLine, shortSha } from '../policy-check/report.mjs'
import { severityOf } from '../policy-check/rule-severity.mjs'
import { MUTATION_NOT_REACHED_NOTE } from './mutation-budget.mjs'

/**
 * @typedef {import('./prove-cycle.mjs').CycleResult} CycleResult
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 * @typedef {{ range: string, headSha: string, githubActions: boolean }} ReportRun
 */

const MILLISECONDS_PER_SECOND = 1000
const TIMED_STEPS = /** @type {const} */ ([
  ['install', 'install'],
  ['parent', 'parent'],
  ['typeCheck', 'type-check'],
  ['green', 'green'],
  ['mutation', 'mutation'],
])

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
 * @param {CycleResult} result
 * @returns {{ finding: Finding, severity: 'fail'|'warn' }[]}
 */
function sortedFindings(result) {
  const all = result.findings.map((finding) => ({ finding, severity: severityOf(finding.rule) }))
  return [
    ...all.filter((entry) => entry.severity === 'fail'),
    ...all.filter((entry) => entry.severity !== 'fail'),
  ]
}

/**
 * A finding with a file names its line only when it belongs to the head commit, because the
 * line is a line of its own GREEN commit's file.
 * @param {Finding} finding
 * @param {CycleResult} result
 * @param {string} headSha
 * @returns {Finding}
 */
function annotatedFinding(finding, result, headSha) {
  if (finding.file === undefined) return finding
  return {
    ...finding,
    message: `${shortSha(result.sha)} ${finding.message}`,
    line: result.sha === headSha ? finding.line : undefined,
  }
}

/**
 * @param {CycleResult} result
 * @param {ReportRun} run
 * @returns {string[]}
 */
function findingLines(result, run) {
  return sortedFindings(result).map(({ finding, severity }) =>
    run.githubActions
      ? formatAnnotation(annotatedFinding(finding, result, run.headSha), severity)
      : `  ${formatPlainLine(finding, severity)}`,
  )
}

/**
 * @param {CycleResult[]} results
 * @returns {boolean} true when a finding fails the run
 */
export function hasFailingFinding(results) {
  return results.some((result) =>
    result.findings.some((finding) => severityOf(finding.rule) === 'fail'),
  )
}

/**
 * @param {CycleResult[]} results
 * @param {ReportRun} run
 * @returns {string[]} the output lines
 */
export function reportLines(results, run) {
  const count = (status) => results.filter((result) => result.status === status).length
  const unreached = results.filter((result) =>
    result.notes.includes(MUTATION_NOT_REACHED_NOTE),
  ).length
  const suffix = unreached > 0 ? `; cycles the mutation check did not reach: ${unreached}` : ''
  const header = `green:proof: ${count('proven')} proven, ${count('skipped')} skipped, ${count('failed')} failed in ${run.range}${suffix}`
  return [
    header,
    ...results.flatMap((result) => [...cycleLines(result), ...findingLines(result, run)]),
  ]
}
