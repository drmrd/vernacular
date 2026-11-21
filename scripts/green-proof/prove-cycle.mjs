/**
 * Checks 1 to 4 of a GREEN proof for one cycle: the RED tests fail at the GREEN commit's parent,
 * pass at the GREEN commit, run every line the GREEN commit adds, and those lines survive mutation.
 */

import { join } from 'node:path'
import { shortSha } from '../policy-check/report.mjs'
import { severityOf } from '../policy-check/rule-severity.mjs'
import { checkCoverage, planCoverage } from './prove-coverage.mjs'
import { checkMutation } from './prove-mutation.mjs'
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
import { assertRanExactlyRedFiles, GENERATED_FOLDER, runVitest } from './vitest-worktree.mjs'

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
 * @typedef {{ cycle: GreenCycle, context: CycleContext, set: RedTestSet, result: CycleResult }} Run the cycle in progress; `set` is the RED test set the next check runs
 * @typedef {{ findings: Finding[], notes: string[] }} CheckReport what a check found and what it noted
 * @typedef {CheckReport & { mutation?: { findings: Finding[], elapsed: number } }} GreenReport checks 2 to 4
 * @typedef {{ skip: string } | { set: RedTestSet, findings: Finding[] }} ParentOutcome either why the cycle is skipped, or the RED test set that ran and the findings
 */

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
  if (set.kind === 'empty') return 'the RED commits leave no test file at this commit'
  return null
}

/**
 * @param {RedTestSet} set
 * @returns {string}
 */
function assetsSkipReason(set) {
  return `no unit test imports the RED test assets: ${set.assetFiles.join(', ')}`
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
  run.result.timings[step] = (run.result.timings[step] ?? 0) + run.context.now() - started
  return value
}

/**
 * @param {Run} run
 * @param {string} sha
 * @returns {Checkout}
 */
function checkoutAt(run, sha) {
  const { root, installMs } = run.context.session.checkout(sha)
  run.result.timings.install = (run.result.timings.install ?? 0) + installMs
  return { root, sha }
}

/**
 * Runs the RED unit files in the worktree. Vitest finding no test or writing no report is an
 * internal error, never a result about the RED tests.
 * @param {Run} run
 * @param {Checkout} checkout
 * @param {{ include: string[], dir: string }} [coverage]
 * @returns {VitestOutcome}
 */
function runRedTests(run, checkout, coverage) {
  const outcome = runVitest(run.context, checkout, { files: run.set.unitFiles, coverage })
  if (outcome.outcome === 'empty') {
    throw new Error(`Vitest empty at ${shortSha(checkout.sha)}: ${outcome.detail}`)
  }
  assertRanExactlyRedFiles(run.set, outcome, checkout.sha)
  return outcome
}

/**
 * Runs the RED tests at the parent. For RED test assets, the unit tests related to them replace the
 * unit files of the cycle, so every later check runs exactly those.
 * @param {Run} run
 * @param {Checkout} checkout
 * @returns {{ outcome: VitestOutcome, set: RedTestSet }} the outcome and the set that ran
 */
function runParentTests(run, checkout) {
  const { set } = run
  if (set.kind !== 'assets-only') return { outcome: runRedTests(run, checkout), set }
  const outcome = runVitest(run.context, checkout, { files: set.assetFiles, related: true })
  if (outcome.outcome === 'empty') return { outcome, set }
  return { outcome, set: { ...set, kind: 'unit', unitFiles: outcome.testFiles } }
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
 * @param {RedTestSet} set
 * @returns {boolean} true when a RED file has a type error
 */
function hasTypeError(run, checkout, set) {
  const targets = typeCheckTargets(set.unitFiles)
  return targets.some(
    (target, index) => typeErrorsOfTarget(run, checkout, { ...target, index }).length > 0,
  )
}

/**
 * @param {Run} run
 * @returns {ParentOutcome} no findings when the RED tests fail or do not type-check at the parent
 */
function checkParent(run) {
  const { cycle, context } = run
  const parent = context.runGit(['rev-parse', `${cycle.green.sha}^`]).trim()
  const checkout = checkoutAt(run, parent)
  const { outcome, set } = measure(run, 'parent', () => runParentTests(run, checkout))
  if (outcome.outcome === 'empty') return { skip: assetsSkipReason(set) }
  if (outcome.outcome === 'failed') return { set, findings: [] }
  if (measure(run, 'typeCheck', () => hasTypeError(run, checkout, set))) {
    return { set, findings: [] }
  }
  const rule = set.kind === 'mixed' ? 'mixed-red-passes-before-green' : 'red-passes-before-green'
  const message = `RED tests pass and type-check at the parent ${shortSha(parent)}: ${set.unitFiles.join(', ')}`
  return { set, findings: [{ rule, sha: cycle.green.sha, message }] }
}

/**
 * Checks 2 to 4: the RED tests pass at the GREEN commit, run every line it adds, and those lines
 * survive mutation. Checks 3 and 4 run only after check 2 passed.
 * @param {Run} run
 * @returns {GreenReport}
 */
function checkGreen(run) {
  const { context, set } = run
  const { sha } = run.cycle.green
  const checkout = checkoutAt(run, sha)
  const { request, lines } = planCoverage(context.runGit, sha)
  const outcome = measure(run, 'green', () => runRedTests(run, checkout, request))
  if (outcome.outcome !== 'passed') {
    const message = `RED tests do not pass at the GREEN commit: ${outcome.detail}`
    return { findings: [{ rule: 'red-fails-at-green', sha, message }], notes: [] }
  }
  const { findings, notes, covered } = checkCoverage(
    lines,
    { sha, root: checkout.root, mixed: set.kind === 'mixed' },
    context.files,
  )
  const proof = { sha, root: checkout.root, redFiles: set.unitFiles }
  return { findings, notes, mutation: checkMutation(covered, proof, context) }
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
 * Checks 1 to 4: the RED tests fail at the GREEN commit's parent, pass at the GREEN commit, run
 * every line it adds, and those lines survive mutation.
 * @param {GreenCycle} cycle
 * @param {CycleContext} context
 * @returns {CycleResult}
 */
export function proveCycle(cycle, context) {
  const result = newResult(cycle.green)
  const set = redTestSet(cycle, existsAtGreen(cycle, context.runGit))
  const reason = skipReason(cycle, set)
  if (reason !== null) return { ...result, status: 'skipped', reason }
  const run = { cycle, context, set, result }
  const parent = checkParent(run)
  if ('skip' in parent) return { ...result, status: 'skipped', reason: parent.skip }
  const green = checkGreen({ ...run, set: parent.set })
  result.findings.push(...parent.findings, ...green.findings)
  result.notes.push(...green.notes)
  if (green.mutation) {
    result.findings.push(...green.mutation.findings)
    result.notes.push(...green.mutation.notes)
    if (green.mutation.elapsed !== undefined) result.timings.mutation = green.mutation.elapsed
  }
  if (result.findings.some((finding) => severityOf(finding.rule) === 'fail')) {
    result.status = 'failed'
  }
  return result
}
