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
    return `${shortSha(finding.sha)}: `
  }
  return ''
}

/**
 * @param {string} sha
 * @returns {string}
 */
function shortSha(sha) {
  return sha.slice(0, SHORT_SHA_LENGTH)
}

/**
 * @param {Finding} finding
 * @param {Severity} severity
 * @returns {string} a GitHub Actions workflow command annotating the finding
 */
export function formatAnnotation(finding, severity) {
  const command = severity === 'fail' ? 'error' : 'warning'
  const properties = [
    ...(finding.file === undefined ? [] : [`file=${escapeProperty(finding.file)}`]),
    ...(finding.line === undefined ? [] : [`line=${finding.line}`]),
    `title=${escapeProperty(finding.rule)}`,
  ]
  const shaPrefix =
    finding.sha !== undefined && finding.file === undefined ? `${shortSha(finding.sha)} ` : ''
  return `::${command} ${properties.join(',')}::${escapeMessage(`${shaPrefix}${finding.message}`)}`
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeMessage(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeProperty(text) {
  return escapeMessage(text).replaceAll(':', '%3A').replaceAll(',', '%2C')
}
