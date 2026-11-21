/**
 * Checks 1 and 2 of a GREEN proof for one cycle: the RED tests fail at the
 * GREEN commit's parent and pass at the GREEN commit.
 */

import { join } from 'node:path'
import { severityOf } from '../policy-check/rule-severity.mjs'
import { redTestSet } from './test-set.mjs'
import {
  declarationFiles,
  showConfigArgs,
  tscArgs,
  typeCheckConfigText,
  typeCheckFailure,
  typeCheckTargets,
  typeErrorsIn,
} from './type-check.mjs'
import { readVitestRun, vitestArgs } from './vitest-run.mjs'

/**
 * @typedef {import('../rgb-audit/cycle-pairing.mjs').GreenCycle} GreenCycle
 * @typedef {import('../rgb-audit/cycle-audit.mjs').ParsedCommit} ParsedCommit
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 * @typedef {import('./test-set.mjs').RedTestSet} RedTestSet
 * @typedef {import('./vitest-run.mjs').VitestOutcome} VitestOutcome
 * @typedef {import('./worktree.mjs').RunGit} RunGit
 * @typedef {import('./worktree.mjs').RunCommand} RunCommand
 * @typedef {import('./worktree.mjs').Files} Files
 * @typedef {'install'|'parent'|'typeCheck'|'green'|'mutation'} Step
 * @typedef {{ sha: string, title: string, status: 'proven'|'skipped'|'failed', reason: string, notes: string[], findings: Finding[], timings: Partial<Record<Step, number>> }} CycleResult
 * @typedef {{ runGit: RunGit, runCommand: RunCommand, files: Files, session: { checkout(sha: string): { root: string, installMs: number } }, now: () => number }} CycleContext
 * @typedef {{ root: string, sha: string }} Checkout the worktree root and the commit checked out in it
 * @typedef {{ cycle: GreenCycle, context: CycleContext, set: RedTestSet, timings: CycleResult['timings'] }} Run
 */

const SHORT_SHA_LENGTH = 8
const GENERATED_FOLDER = '.green-proof'
const VITEST_REPORT = 'vitest-run.json'

/**
 * @param {string} sha
 * @returns {string}
 */
function shortSha(sha) {
  return sha.slice(0, SHORT_SHA_LENGTH)
}

/**
 * @param {GreenCycle} cycle
 * @param {RunGit} runGit
 * @returns {(path: string) => boolean}
 */
function existsAtGreen(cycle, runGit) {
  const paths = [...new Set(cycle.reds.flatMap((red) => red.files))]
  if (paths.length === 0) return () => false
  const listing = runGit(['ls-tree', '-r', '-z', '--name-only', cycle.green.sha, '--', ...paths])
  const present = new Set(listing.split('\0').filter((line) => line !== ''))
  return (path) => present.has(path)
}

/**
 * @param {GreenCycle} cycle
 * @param {RedTestSet} set
 * @returns {string | null}
 */
function skipReason(cycle, set) {
  if (cycle.reds.length === 0) return 'no RED commit before this GREEN commit'
  if (set.kind === 'other-only') {
    return `RED tests are only end-to-end, browser, or story tests: ${set.otherFiles.join(', ')}`
  }
  if (set.kind === 'assets-only') {
    return `no unit test imports the RED test assets: ${set.assetFiles.join(', ')}`
  }
  if (set.kind === 'empty') return 'the RED commits leave no test file at this commit'
  return null
}

/**
 * @template T
 * @param {Run} run
 * @param {Step} step
 * @param {() => T} action
 * @returns {T}
 */
function measure(run, step, action) {
  const started = run.context.now()
  const value = action()
  run.timings[step] = (run.timings[step] ?? 0) + run.context.now() - started
  return value
}

/**
 * @param {Run} run
 * @param {string} sha
 * @returns {Checkout}
 */
function checkoutAt(run, sha) {
  const { root, installMs } = run.context.session.checkout(sha)
  run.timings.install = (run.timings.install ?? 0) + installMs
  return { root, sha }
}

/**
 * @param {Files} files
 * @param {string} path
 * @returns {string}
 */
function readOrEmpty(files, path) {
  try {
    return files.readFile(path)
  } catch {
    return ''
  }
}

/**
 * Vitest file filters match by substring, so a run can leave out a RED file or add an extra one.
 * @param {RedTestSet} set
 * @param {VitestOutcome} outcome
 * @param {string} sha
 */
function assertRanExactlyRedFiles(set, outcome, sha) {
  const expected = new Set(set.unitFiles)
  const actual = new Set(outcome.testFiles)
  const missing = set.unitFiles.filter((file) => !actual.has(file))
  const extra = outcome.testFiles.filter((file) => !expected.has(file))
  if (missing.length === 0 && extra.length === 0) return
  throw new Error(
    `Vitest ran a different set of test files than the RED files at ${shortSha(sha)}: ` +
      `missing [${missing.join(', ')}], extra [${extra.join(', ')}]`,
  )
}

/**
 * Runs the RED unit files in the worktree. Vitest finding no test or writing no report is an
 * internal error, never a result about the RED tests.
 * @param {Run} run
 * @param {Checkout} checkout
 * @returns {VitestOutcome}
 */
function runRedTests(run, { root, sha }) {
  const { files, runCommand } = run.context
  const jsonFile = join(root, GENERATED_FOLDER, VITEST_REPORT)
  files.removeFile(jsonFile)
  const args = vitestArgs({ files: run.set.unitFiles, jsonFile })
  const result = runCommand('pnpm', args, { cwd: root })
  const outcome = readVitestRun(result.status, readOrEmpty(files, jsonFile), root)
  if (outcome.outcome === 'empty' || outcome.outcome === 'error') {
    throw new Error(`Vitest ${outcome.outcome} at ${shortSha(sha)}: ${outcome.detail}`)
  }
  assertRanExactlyRedFiles(run.set, outcome, sha)
  return outcome
}

/**
 * @param {Run} run
 * @param {Checkout} checkout
 * @param {{ config: string, files: string[], index: number }} target
 * @returns {string[]} the type errors in the target's RED files
 */
function typeErrorsOfTarget(run, { root, sha }, target) {
  const { index } = target
  const { runCommand, files } = run.context
  const shown = runCommand('pnpm', showConfigArgs(target.config), { cwd: root })
  const declarations = declarationFiles(shown.stdout)
  if (declarations === null) {
    throw new Error(`tsc --showConfig gave no file list for ${target.config} at ${shortSha(sha)}`)
  }
  const configPath = join(GENERATED_FOLDER, `tsconfig.check-${index}.json`)
  files.writeFile(
    join(root, configPath),
    typeCheckConfigText(target.config, target.files, declarations),
  )
  const checked = runCommand('pnpm', tscArgs(configPath), { cwd: root })
  const output = `${checked.stdout}\n${checked.stderr}`
  const failure = typeCheckFailure(checked.status, output)
  if (failure !== null)
    throw new Error(`tsc failed for ${target.config} at ${shortSha(sha)}: ${failure}`)
  return typeErrorsIn(output, target.files)
}

/**
 * @param {Run} run
 * @param {Checkout} checkout
 * @returns {boolean} true when a RED file has a type error
 */
function hasTypeError(run, checkout) {
  const targets = typeCheckTargets(run.set.unitFiles)
  return targets.some(
    (target, index) => typeErrorsOfTarget(run, checkout, { ...target, index }).length > 0,
  )
}

/**
 * @param {Run} run
 * @returns {Finding | null}
 */
function checkParent(run) {
  const { cycle, context, set } = run
  const parent = context.runGit(['rev-parse', `${cycle.green.sha}^`]).trim()
  const checkout = checkoutAt(run, parent)
  const outcome = measure(run, 'parent', () => runRedTests(run, checkout))
  if (outcome.outcome === 'failed') return null
  if (measure(run, 'typeCheck', () => hasTypeError(run, checkout))) return null
  return {
    rule: set.kind === 'mixed' ? 'mixed-red-passes-before-green' : 'red-passes-before-green',
    sha: cycle.green.sha,
    message: `RED tests pass and type-check at the parent ${shortSha(parent)}: ${set.unitFiles.join(', ')}`,
  }
}

/**
 * @param {Run} run
 * @returns {Finding | null}
 */
function checkGreen(run) {
  const sha = run.cycle.green.sha
  const checkout = checkoutAt(run, sha)
  const outcome = measure(run, 'green', () => runRedTests(run, checkout))
  if (outcome.outcome === 'passed') return null
  return {
    rule: 'red-fails-at-green',
    sha,
    message: `RED tests do not pass at the GREEN commit: ${outcome.detail}`,
  }
}

/**
 * @param {ParsedCommit} green
 * @returns {CycleResult}
 */
function newResult(green) {
  return {
    sha: green.sha,
    title: `${green.type}: ${green.subject}`,
    status: 'proven',
    reason: '',
    notes: [],
    findings: [],
    timings: {},
  }
}

/**
 * Checks 1 and 2: RED tests fail at the GREEN commit's parent and pass at the GREEN commit.
 * @param {GreenCycle} cycle
 * @param {CycleContext} context
 * @returns {CycleResult}
 */
export function proveCycle(cycle, context) {
  const result = newResult(cycle.green)
  const set = redTestSet(cycle, existsAtGreen(cycle, context.runGit))
  const reason = skipReason(cycle, set)
  if (reason !== null) return { ...result, status: 'skipped', reason }
  const run = { cycle, context, set, timings: result.timings }
  for (const finding of [checkParent(run), checkGreen(run)]) {
    if (finding !== null) result.findings.push(finding)
  }
  if (result.findings.some((finding) => severityOf(finding.rule) === 'fail')) {
    result.status = 'failed'
  }
  return result
}
