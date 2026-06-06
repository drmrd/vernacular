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
 * Blue presence rule: every GREEN commit must be closed by a BLUE refactor
 * commit before the next RED commit or the end of the range.
 *
 * The loop is a small state machine over two carried values: `pendingRed`, the
 * count of RED commits not yet consumed by a GREEN, and `openGreen`, the sha of
 * a GREEN cycle still awaiting its closing BLUE (or null). Each role advances
 * that state and may emit violations; `auditCommits` itself only drives the loop.
 *
 * @param {ParsedCommit[]} commits
 * @returns {Violation[]}
 */
export function auditCommits(commits) {
  const violations = []
  let state = { pendingRed: 0, openGreen: null }
  for (const commit of commits) {
    const role = classify(commit)
    if (role === 'red') {
      state = advanceOnRed(state, violations)
    } else if (role === 'green') {
      state = advanceOnGreen(state, commit, violations)
    } else if (role === 'blue') {
      state = advanceOnBlue(state)
    }
  }
  if (state.openGreen !== null) {
    violations.push(blueViolation(state.openGreen))
  }
  return violations
}

/**
 * The state carried across the audit loop.
 * @typedef {{ pendingRed: number, openGreen: string|null }} AuditState
 */

/**
 * A RED commit closes any open GREEN cycle (it cannot have seen its BLUE) and
 * adds to the pool of RED commits a later GREEN may consume.
 *
 * @param {AuditState} state
 * @param {Violation[]} violations
 * @returns {AuditState}
 */
function advanceOnRed(state, violations) {
  if (state.openGreen !== null) {
    violations.push(blueViolation(state.openGreen))
  }
  return { pendingRed: state.pendingRed + 1, openGreen: null }
}

/**
 * A GREEN commit consumes the pending RED pool and is checked against the
 * ordering and independence rules (both can fire for the same commit).
 *
 * Only an ordering-valid GREEN (one with a preceding RED) opens a cycle to
 * track for blue presence; an ordering-invalid GREEN has no well-defined cycle
 * to close, so it is never tracked as `openGreen`.
 *
 * @param {AuditState} state
 * @param {ParsedCommit} commit
 * @param {Violation[]} violations
 * @returns {AuditState}
 */
function advanceOnGreen(state, commit, violations) {
  const hasPrecedingRed = state.pendingRed > 0
  const ordering = orderingViolation(commit, hasPrecedingRed)
  if (ordering !== null) {
    violations.push(ordering)
  }
  const independence = independenceViolation(commit)
  if (independence !== null) {
    violations.push(independence)
  }
  return { pendingRed: 0, openGreen: hasPrecedingRed ? commit.sha : null }
}

/**
 * A BLUE commit closes the open GREEN cycle, satisfying the blue-presence rule.
 *
 * @param {AuditState} state
 * @returns {AuditState}
 */
function advanceOnBlue(state) {
  return { pendingRed: state.pendingRed, openGreen: null }
}

/**
 * Ordering rule: a GREEN commit must be preceded by an unconsumed RED commit.
 *
 * @param {ParsedCommit} commit
 * @param {boolean} hasPrecedingRed
 * @returns {Violation|null}
 */
function orderingViolation(commit, hasPrecedingRed) {
  if (hasPrecedingRed) {
    return null
  }
  return {
    sha: commit.sha,
    rule: 'ordering',
    message: `GREEN commit ${commit.sha} has no preceding RED test commit in range`,
  }
}

/**
 * Independence rule: a GREEN commit must change no test files.
 *
 * @param {ParsedCommit} commit
 * @returns {Violation|null}
 */
function independenceViolation(commit) {
  const testFiles = commit.files.filter((file) => TEST_FILE_PATTERN.test(file))
  if (testFiles.length === 0) {
    return null
  }
  return {
    sha: commit.sha,
    rule: 'independence',
    message: `GREEN commit ${commit.sha} modifies test file(s): ${testFiles.join(', ')}`,
  }
}

/**
 * Build the blue-presence violation for a GREEN commit left unclosed.
 *
 * @param {string} sha
 * @returns {Violation}
 */
function blueViolation(sha) {
  return {
    sha,
    rule: 'blue',
    message: `GREEN commit ${sha} not closed by a BLUE refactor`,
  }
}
