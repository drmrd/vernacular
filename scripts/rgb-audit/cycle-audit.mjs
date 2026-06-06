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
const TEST_FILE_PATTERN = /\.test\.(ts|tsx|mjs|js)$/

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

/**
 * Classify a commit by its role in the red-green-blue cycle.
 *
 * @param {ParsedCommit} commit
 * @returns {'red'|'green'|'blue'|'exempt'}
 */
function classify(commit) {
  if (commit.infra) {
    return 'exempt'
  }
  if (commit.type === 'test') {
    return commit.scope === 'e2e' ? 'exempt' : 'red'
  }
  if (commit.type === 'feat' || commit.type === 'fix') {
    return 'green'
  }
  if (commit.type === 'refactor') {
    return 'blue'
  }
  return 'exempt'
}

/**
 * Audit an oldest-first sequence of commits for red-green-blue cycle violations.
 *
 * Ordering rule: every GREEN commit must be preceded by at least one RED test
 * commit that has not already been consumed by an earlier GREEN commit.
 *
 * Independence rule: a GREEN commit must change no test files.
 *
 * @param {ParsedCommit[]} commits
 * @returns {Violation[]}
 */
export function auditCommits(commits) {
  const violations = []
  let pendingRed = 0
  for (const commit of commits) {
    const role = classify(commit)
    if (role === 'red') {
      pendingRed += 1
    } else if (role === 'green') {
      if (pendingRed === 0) {
        violations.push({
          sha: commit.sha,
          rule: 'ordering',
          message: `GREEN commit ${commit.sha} has no preceding RED test commit in range`,
        })
      }
      const testFiles = commit.files.filter((file) => TEST_FILE_PATTERN.test(file))
      if (testFiles.length > 0) {
        violations.push({
          sha: commit.sha,
          rule: 'independence',
          message: `GREEN commit ${commit.sha} modifies test file(s): ${testFiles.join(', ')}`,
        })
      }
      pendingRed = 0
    }
  }
  return violations
}
