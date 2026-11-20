/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./rule-severity.mjs').Severity} Severity */

const SHORT_SHA_LENGTH = 8

/**
 * @param {Finding} finding
 * @param {Severity} severity
 * @returns {string}
 */
export function formatPlainLine(finding, severity) {
  return `  [${severity}] [${finding.rule}] ${locationOf(finding)}${finding.message}`
}

/**
 * @param {Finding} finding
 * @returns {string}
 */
function locationOf(finding) {
  if (finding.file !== undefined && finding.line !== undefined) {
    return `${finding.file}:${finding.line}: `
  }
  if (finding.file !== undefined) {
    return `${finding.file}: `
  }
  if (finding.sha !== undefined) {
    return `${finding.sha.slice(0, SHORT_SHA_LENGTH)}: `
  }
  return ''
}
