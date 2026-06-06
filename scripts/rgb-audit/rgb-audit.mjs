#!/usr/bin/env node
// scripts/rgb-audit/rgb-audit.mjs
//
// rgb-audit CLI: map a branch's commit range to a red-green-blue cycle verdict.
// The dependency-injected shell reads `git log` for a range, delegates parsing
// and rule checks to ./cycle-audit.mjs, and reports either a clean line or one
// line per violation. Exit code 0 means clean; 1 means at least one violation.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { auditCommits, parseGitLog } from './cycle-audit.mjs'

const EXIT_CLEAN = 0
const EXIT_VIOLATIONS = 1
const EXIT_INTERNAL = 2
const DEFAULT_RANGE = 'main..HEAD'

/**
 * @typedef {object} RgbAuditDeps
 * @property {(args: readonly string[]) => string} runGit
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} argv arguments after the node binary and script path
 * @param {RgbAuditDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runRgbAudit(argv, { runGit, log }) {
  const range = resolveRange(argv)
  const raw = runGit([
    'log',
    '--reverse',
    '--no-merges',
    range,
    '--pretty=format:%x1e%H%x1f%s%x1f%(trailers:key=Infrastructure,valueonly,separator=%x20)',
    '--name-only',
  ])
  const violations = auditCommits(parseGitLog(raw))
  if (violations.length === 0) {
    log(`rgb:audit: clean (${range})`)
    return EXIT_CLEAN
  }
  log(`rgb:audit: ${violations.length} violation(s) in ${range}`)
  for (const violation of violations) {
    log(`  [${violation.rule}] ${violation.message}`)
  }
  return EXIT_VIOLATIONS
}

/**
 * Resolve the commit range from argv. A `--range` flag takes the next element;
 * otherwise the first non-flag argument; otherwise the default.
 *
 * @param {readonly string[]} argv
 * @returns {string}
 */
function resolveRange(argv) {
  const flagIndex = argv.indexOf('--range')
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    return argv[flagIndex + 1]
  }
  const positional = argv.find((entry) => !entry.startsWith('-'))
  return positional ?? DEFAULT_RANGE
}

// Run only when invoked directly (node scripts/rgb-audit/rgb-audit.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runRgbAudit(process.argv.slice(2), {
    runGit: (args) => execFileSync('git', args, { encoding: 'utf8' }),
    log: (line) => console.log(line),
  })
    .then((code) => {
      process.exit(code)
    })
    .catch((error) => {
      // Defensive: runRgbAudit returns codes and does not reject, so this signals
      // an unexpected internal fault, not a violation verdict.
      console.error(error)
      process.exit(EXIT_INTERNAL)
    })
}
