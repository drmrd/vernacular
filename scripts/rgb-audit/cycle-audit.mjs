// scripts/rgb-audit/cycle-audit.mjs
//
// Pure helpers for auditing the red-green-blue TDD cycle across a branch's git
// history. No filesystem or process access: callers feed in raw `git log` output
// and receive structured commits and rule violations. This module is the parsing
// half; rule checks consume the parsed commits it produces.

/**
 * A single commit parsed from `git log` output.
 * @typedef {{ sha: string, type: string, scope: string, subject: string, files: string[], infra: boolean }} ParsedCommit
 */

/**
 * A red-green-blue cycle rule that a sequence of commits broke.
 * @typedef {{ sha: string, rule: 'ordering'|'independence'|'blue', message: string }} Violation
 */

const RECORD_SEPARATOR = '\x1e'
const UNIT_SEPARATOR = '\x1f'
const CONVENTIONAL_COMMIT_PATTERN = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/

/**
 * Parse raw `git log` output into structured commits.
 *
 * Each record is separated by the RS byte and its first line carries three
 * US-byte-separated fields: sha, subject, and the joined Infrastructure trailer
 * value. The remaining non-empty lines are changed file paths.
 *
 * @param {string} raw
 * @returns {ParsedCommit[]}
 */
export function parseGitLog(raw) {
  if (raw === '') {
    return []
  }
  return raw
    .split(RECORD_SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '')
    .map(parseRecord)
}

/**
 * @param {string} record
 * @returns {ParsedCommit}
 */
function parseRecord(record) {
  const lines = record.split('\n')
  const [sha = '', rawSubject = '', infraTrailer = ''] = lines[0].split(UNIT_SEPARATOR)
  const files = lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const { type, scope, subject } = parseSubject(rawSubject)
  return { sha, type, scope, subject, files, infra: infraTrailer.trim() !== '' }
}

/**
 * @param {string} rawSubject
 * @returns {{ type: string, scope: string, subject: string }}
 */
function parseSubject(rawSubject) {
  const match = CONVENTIONAL_COMMIT_PATTERN.exec(rawSubject)
  if (match === null) {
    return { type: '', scope: '', subject: rawSubject }
  }
  return { type: match[1], scope: match[2] ?? '', subject: match[3] }
}
