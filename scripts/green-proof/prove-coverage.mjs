/**
 * Check 3 of a GREEN proof: every added line that can run is run by the RED tests.
 */

import { join } from 'node:path'
import { parseUnifiedDiff } from '../policy-check/git-input.mjs'
import { parseLcov, splitByCoverage, uncoveredLineFindings } from './coverage.mjs'
import { isProofSource, parseRemovedLines, provableAddedLines } from './diff-lines.mjs'
import { LCOV_FILE } from './vitest-worktree.mjs'

/**
 * @typedef {import('../rgb-audit/cycle-pairing.mjs').GreenCycle} GreenCycle
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 * @typedef {import('./worktree.mjs').RunGit} RunGit
 * @typedef {import('./worktree.mjs').Files} Files
 */

const COVERAGE_FOLDER = '.green-proof/coverage'

/**
 * @param {RunGit} runGit
 * @param {string} sha
 * @returns {string} the unified diff of the commit, with paths unquoted
 */
function showDiff(runGit, sha) {
  return runGit([
    '-c',
    'core.quotePath=false',
    'show',
    '--format=',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '-M',
    sha,
  ])
}

/**
 * @param {string} diff
 * @returns {import('../policy-check/git-input.mjs').AddedLine[]}
 */
function addedSourceLines(diff) {
  return parseUnifiedDiff(diff).filter(({ file }) => isProofSource(file))
}

/**
 * @param {GreenCycle} cycle
 * @param {RunGit} runGit
 * @returns {{ include: string[], dir: string } | undefined} undefined when no changed file needs proof
 */
export function coverageRequest(cycle, runGit) {
  const lines = addedSourceLines(showDiff(runGit, cycle.green.sha))
  const include = [...new Set(lines.map(({ file }) => file))]
  return include.length === 0 ? undefined : { include, dir: COVERAGE_FOLDER }
}

/**
 * @param {RunGit} runGit
 * @param {string} sha
 * @returns {import('../policy-check/git-input.mjs').AddedLine[]}
 */
function provableLines(runGit, sha) {
  const diff = showDiff(runGit, sha)
  return provableAddedLines(addedSourceLines(diff), parseRemovedLines(diff))
}

/**
 * @param {string} root
 * @returns {string}
 */
function lcovPath(root) {
  return join(root, COVERAGE_FOLDER, LCOV_FILE)
}

/**
 * @param {Files} files
 * @param {string} root
 * @returns {string} the lcov text; a missing file or one with no records throws, since the run asked for coverage
 */
function readLcov(files, root) {
  const path = lcovPath(root)
  try {
    return files.readFile(path)
  } catch (error) {
    throw new Error(`the coverage run wrote no lcov file at ${path}`, { cause: error })
  }
}

/**
 * @param {{ cycle: GreenCycle, root: string, mixed: boolean }} request
 * @param {{ runGit: RunGit, files: Files }} context
 * @returns {{ findings: Finding[], notes: string[] }}
 */
export function checkCoverage({ cycle, root, mixed }, { runGit, files }) {
  const { sha } = cycle.green
  const lines = provableLines(runGit, sha)
  if (lines.length === 0) return { findings: [], notes: [] }
  const coverage = parseLcov(readLcov(files, root), root)
  if (coverage.size === 0) {
    throw new Error(`the coverage run wrote an lcov file with no records at ${lcovPath(root)}`)
  }
  const { uncovered, unrecorded } = splitByCoverage(lines, coverage)
  const rule = mixed ? 'mixed-uncovered-added-line' : 'uncovered-added-line'
  const notes =
    unrecorded.length === 0
      ? []
      : [`no coverage record (excluded from coverage): ${unrecorded.join(', ')}`]
  return { findings: uncoveredLineFindings(uncovered, sha, rule), notes }
}
