/**
 * green:proof CLI shell: reads a commit range, pairs each GREEN commit with its RED commits,
 * proves each cycle in one temporary worktree, prints the report, and returns the exit code.
 * Exit code 0 means no failing finding, 1 means at least one, 2 means an internal error.
 */

import { fileURLToPath } from 'node:url'
import { shortSha } from '../policy-check/report.mjs'
import { GIT_LOG_FORMAT, parseGitLog } from '../rgb-audit/cycle-audit.mjs'
import { pairGreenCycles } from '../rgb-audit/cycle-pairing.mjs'
import { defaultDeps } from './default-deps.mjs'
import { hasFailingFinding, reportLines } from './green-proof-report.mjs'
import { createMutationBudget, parseBudgetMinutes } from './mutation-budget.mjs'
import { proveCycle } from './prove-cycle.mjs'
import { createWorktreeSession } from './worktree.mjs'

/**
 * @typedef {import('./prove-cycle.mjs').CycleResult} CycleResult
 * @typedef {import('./worktree.mjs').RunGit} RunGit
 * @typedef {import('./worktree.mjs').RunCommand} RunCommand
 * @typedef {import('./worktree.mjs').Files} Files
 * @typedef {{ runGit: RunGit, runCommand: RunCommand, files: Files, log: (line: string) => void, githubActions: boolean, now: () => number }} GreenProofDeps
 * @typedef {{ range: string | null, commit: string | null, base: string, mutationBudgetMinutes: number | null }} Options
 */

const EXIT_CLEAN = 0
const EXIT_FAILING = 1
const EXIT_INTERNAL = 2
const DEFAULT_BASE = 'origin/main'
const DEFAULT_HEAD = 'HEAD'
const RANGE_SEPARATOR = '..'
const NOT_FOUND = -1
const OPTION_KEYS = {
  '--range': 'range',
  '--commit': 'commit',
  '--base': 'base',
  '--mutation-budget-minutes': 'mutationBudgetMinutes',
}

/**
 * @param {readonly string[]} argv
 * @returns {Options}
 */
function parseOptions(argv) {
  /** @type {Options} */
  const options = { range: null, commit: null, base: DEFAULT_BASE, mutationBudgetMinutes: null }
  for (let index = 0; index < argv.length; index += 2) {
    const key = Object.hasOwn(OPTION_KEYS, argv[index]) ? OPTION_KEYS[argv[index]] : undefined
    const value = argv[index + 1]
    if (key === undefined) throw new Error(`unknown option ${argv[index]}`)
    if (value === undefined) throw new Error(`${argv[index]} needs a value`)
    options[key] = key === 'mutationBudgetMinutes' ? parseBudgetMinutes(value) : value
  }
  if (options.range !== null && options.commit !== null) {
    throw new Error('use either --range or --commit, not both')
  }
  return options
}

/**
 * @param {Options} options
 * @param {RunGit} runGit
 * @returns {{ range: string, onlySha: string | null, headSha: string }}
 */
function resolveRange(options, runGit) {
  if (options.commit !== null) {
    const resolved = resolveCommit(options.commit, runGit)
    return { range: `${options.base}..${resolved}`, onlySha: resolved, headSha: resolved }
  }
  const range = options.range ?? `${options.base}..${DEFAULT_HEAD}`
  return { range, onlySha: null, headSha: resolveCommit(rangeHead(range), runGit) }
}

/**
 * The head of `A..B` and of `A...B` is B, an empty B means HEAD, and a range
 * without dots names its head as the whole text.
 * @param {string} range
 * @returns {string} the revision the range ends at
 */
function rangeHead(range) {
  const separatorIndex = range.lastIndexOf(RANGE_SEPARATOR)
  if (separatorIndex === NOT_FOUND) return range
  const head = range.slice(separatorIndex + RANGE_SEPARATOR.length)
  return head === '' ? DEFAULT_HEAD : head
}

/**
 * @param {string} revision
 * @param {RunGit} runGit
 * @returns {string} the full sha of the commit the revision names
 */
function resolveCommit(revision, runGit) {
  return runGit(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).trim()
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
 * Proves the cycles newest first, so the budget goes to the newest GREEN commits, and returns the results in range order.
 * @param {import('../rgb-audit/cycle-pairing.mjs').GreenCycle[]} cycles
 * @param {GreenProofDeps} deps
 * @param {number | null} budgetMinutes null means no cap
 * @returns {CycleResult[]}
 */
function proveAll(cycles, deps, budgetMinutes) {
  const { runGit, runCommand, files, now } = deps
  const budget = createMutationBudget(budgetMinutes)
  const session = createWorktreeSession({ runGit, runCommand, files, now })
  try {
    const context = { runGit, runCommand, files, session, now, budget }
    return [...cycles]
      .reverse()
      .map((cycle) => proveCycle(cycle, context))
      .reverse()
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
    const options = parseOptions(argv)
    const { range, onlySha, headSha } = resolveRange(options, deps.runGit)
    const cycles = selectCycles(readCycles(range, deps.runGit), onlySha, range)
    if (cycles.length === 0) {
      deps.log(`green:proof: no GREEN commit in ${range}`)
      return EXIT_CLEAN
    }
    const results = proveAll(cycles, deps, options.mutationBudgetMinutes)
    for (const line of reportLines(results, { range, headSha, githubActions: deps.githubActions }))
      deps.log(line)
    return hasFailingFinding(results) ? EXIT_FAILING : EXIT_CLEAN
  } catch (error) {
    deps.log(`green:proof: internal error: ${error instanceof Error ? error.message : error}`)
    return EXIT_INTERNAL
  }
}

// Run only when invoked directly (node scripts/green-proof/green-proof.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

const KEEP_ALIVE_SIGNALS = ['SIGINT', 'SIGTERM']

/**
 * Deliberately does nothing. Installing a listener replaces the default action of Node for the
 * signal, so the process is not killed at once.
 */
function ignoreSignal() {}

/**
 * Runs the command with the real dependencies. The signal listeners replace the default action
 * of Node, so a Ctrl-C stops only the running child process; the finally block then removes the
 * worktree, and the exit code is 2.
 */
function runFromCommandLine() {
  for (const signal of KEEP_ALIVE_SIGNALS) process.on(signal, ignoreSignal)
  const deps = defaultDeps()
  runGreenProof(process.argv.slice(2), deps)
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exit(EXIT_INTERNAL)
    })
}

if (isDirectInvocation) runFromCommandLine()
