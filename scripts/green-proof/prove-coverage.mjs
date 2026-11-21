/**
 * Check 3 of a GREEN proof: every added line that can run is run by the RED tests.
 */

import { join } from 'node:path'
import { parseUnifiedDiff } from '../policy-check/git-input.mjs'
import { parseLcov, splitByCoverage, uncoveredLineFindings } from './coverage.mjs'
import { splitGuardLines } from './guard-block.mjs'
import { isProofSource, parseRemovedLines, provableAddedLines } from './diff-lines.mjs'
import { GENERATED_FOLDER, LCOV_FILE } from './vitest-worktree.mjs'

/**
 * @typedef {import('../rgb-audit/cycle-pairing.mjs').GreenCycle} GreenCycle
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 * @typedef {import('./worktree.mjs').RunGit} RunGit
 * @typedef {import('./worktree.mjs').Files} Files
 */

const COVERAGE_FOLDER = join(GENERATED_FOLDER, 'coverage')

/**
 * @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine
 * @typedef {{ include: string[], dir: string }} CoverageRequest the files whose coverage the run records
 * @typedef {{ request: CoverageRequest | undefined, lines: AddedLine[] }} CoveragePlan
 */

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
 * Reads the GREEN commit's diff once: the files to record coverage for, and the added lines to prove.
 * @param {RunGit} runGit
 * @param {string} sha
 * @returns {CoveragePlan} `request` is undefined when no changed file needs proof
 */
export function planCoverage(runGit, sha) {
  const diff = showDiff(runGit, sha)
  const added = parseUnifiedDiff(diff).filter(({ file }) => isProofSource(file))
  const include = [...new Set(added.map(({ file }) => file))]
  return {
    request: include.length === 0 ? undefined : { include, dir: COVERAGE_FOLDER },
    lines: provableAddedLines(added, parseRemovedLines(diff)),
  }
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
 * @param {AddedLine[]} lines the provable added lines of the GREEN commit
 * @param {{ sha: string, root: string, mixed: boolean }} proof
 * @param {Files} files
 * @returns {{ findings: Finding[], notes: string[], covered: AddedLine[] }}
 */
export function checkCoverage(lines, { sha, root, mixed }, files) {
  if (lines.length === 0) return { findings: [], notes: [], covered: [] }
  const coverage = parseLcov(readLcov(files, root), root)
  if (coverage.size === 0) {
    throw new Error(`the coverage run wrote an lcov file with no records at ${lcovPath(root)}`)
  }
  const { covered, uncovered, unrecorded } = splitByCoverage(lines, coverage)
  const rule = mixed ? 'mixed-uncovered-added-line' : 'uncovered-added-line'
  const notes =
    unrecorded.length === 0
      ? []
      : [`no coverage record (excluded from coverage): ${unrecorded.join(', ')}`]
  const { guard, other } = splitGuardLines(uncovered, (file) => files.readFile(join(root, file)))
  const findings = [
    ...uncoveredLineFindings(other, sha, rule),
    ...uncoveredLineFindings(guard, sha, 'uncovered-guard-line'),
  ]
  return { findings, notes, covered }
}
