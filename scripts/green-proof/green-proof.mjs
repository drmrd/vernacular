/**
 * green:proof CLI shell: reads a commit range, pairs each GREEN commit with its RED commits,
 * proves each cycle in one temporary worktree, prints the report, and returns the exit code.
 * Exit code 0 means no failing finding, 1 means at least one, 2 means an internal error.
 */

import { shortSha } from '../policy-check/report.mjs'
import { GIT_LOG_FORMAT, parseGitLog } from '../rgb-audit/cycle-audit.mjs'
import { pairGreenCycles } from '../rgb-audit/cycle-pairing.mjs'
import { hasFailingFinding, reportLines } from './green-proof-report.mjs'
import { proveCycle } from './prove-cycle.mjs'
import { createWorktreeSession } from './worktree.mjs'

/**
 * @typedef {import('./prove-cycle.mjs').CycleResult} CycleResult
 * @typedef {import('./worktree.mjs').RunGit} RunGit
 * @typedef {import('./worktree.mjs').RunCommand} RunCommand
 * @typedef {import('./worktree.mjs').Files} Files
 * @typedef {{ runGit: RunGit, runCommand: RunCommand, files: Files, log: (line: string) => void, githubActions: boolean, now: () => number }} GreenProofDeps
 * @typedef {{ range: string | null, commit: string | null, base: string }} Options
 */

const EXIT_CLEAN = 0
const EXIT_FAILING = 1
const EXIT_INTERNAL = 2
const DEFAULT_BASE = 'origin/main'
const DEFAULT_HEAD = 'HEAD'
const OPTION_KEYS = { '--range': 'range', '--commit': 'commit', '--base': 'base' }

/**
 * @param {readonly string[]} argv
 * @returns {Options}
 */
function parseOptions(argv) {
  /** @type {Options} */
  const options = { range: null, commit: null, base: DEFAULT_BASE }
  for (let index = 0; index < argv.length; index += 2) {
    const key = Object.hasOwn(OPTION_KEYS, argv[index]) ? OPTION_KEYS[argv[index]] : undefined
    const value = argv[index + 1]
    if (key === undefined) throw new Error(`unknown option ${argv[index]}`)
    if (value === undefined) throw new Error(`${argv[index]} needs a value`)
    options[key] = value
  }
  if (options.range !== null && options.commit !== null) {
    throw new Error('use either --range or --commit, not both')
  }
  return options
}

/**
 * @param {Options} options
 * @param {RunGit} runGit
 * @returns {{ range: string, onlySha: string | null }}
 */
function resolveRange(options, runGit) {
  if (options.commit !== null) {
    const resolved = runGit([
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${options.commit}^{commit}`,
    ]).trim()
    return { range: `${options.base}..${resolved}`, onlySha: resolved }
  }
  return { range: options.range ?? `${options.base}..${DEFAULT_HEAD}`, onlySha: null }
}

/**
 * @param {string} range
 * @param {RunGit} runGit
 * @returns {import('../rgb-audit/cycle-pairing.mjs').GreenCycle[]}
 */
function readCycles(range, runGit) {
  const raw = runGit([
    'log',
    '--reverse',
    '--no-merges',
    range,
    `--pretty=format:${GIT_LOG_FORMAT}`,
    '--name-only',
  ])
  return pairGreenCycles(parseGitLog(raw))
}

/**
 * @param {import('../rgb-audit/cycle-pairing.mjs').GreenCycle[]} cycles
 * @param {string | null} onlySha
 * @param {string} range
 * @returns {import('../rgb-audit/cycle-pairing.mjs').GreenCycle[]}
 */
function selectCycles(cycles, onlySha, range) {
  if (onlySha === null) return cycles
  const selected = cycles.filter((cycle) => cycle.green.sha === onlySha)
  if (selected.length === 0) {
    throw new Error(`${shortSha(onlySha)} is not a GREEN commit in ${range}`)
  }
  return selected
}

/**
 * @param {import('../rgb-audit/cycle-pairing.mjs').GreenCycle[]} cycles
 * @param {GreenProofDeps} deps
 * @returns {CycleResult[]}
 */
function proveAll(cycles, deps) {
  const { runGit, runCommand, files, now } = deps
  const session = createWorktreeSession({ runGit, runCommand, files, now })
  try {
    return cycles.map((cycle) => proveCycle(cycle, { runGit, runCommand, files, session, now }))
  } finally {
    session.dispose()
  }
}

/**
 * @param {readonly string[]} argv arguments after the node binary and script path
 * @param {GreenProofDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runGreenProof(argv, deps) {
  try {
    const { range, onlySha } = resolveRange(parseOptions(argv), deps.runGit)
    const cycles = selectCycles(readCycles(range, deps.runGit), onlySha, range)
    if (cycles.length === 0) {
      deps.log(`green:proof: no GREEN commit in ${range}`)
      return EXIT_CLEAN
    }
    const results = proveAll(cycles, deps)
    for (const line of reportLines(results, range, deps.githubActions)) deps.log(line)
    return hasFailingFinding(results) ? EXIT_FAILING : EXIT_CLEAN
  } catch (error) {
    deps.log(`green:proof: internal error: ${error instanceof Error ? error.message : error}`)
    return EXIT_INTERNAL
  }
}
