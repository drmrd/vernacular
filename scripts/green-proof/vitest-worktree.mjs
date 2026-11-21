/**
 * Runs Vitest in a temporary worktree and reads its JSON report.
 */

import { join } from 'node:path'
import { shortSha } from '../policy-check/report.mjs'
import { readVitestRun, vitestArgs } from './vitest-run.mjs'

/**
 * @typedef {import('./test-set.mjs').RedTestSet} RedTestSet
 * @typedef {import('./vitest-run.mjs').VitestOutcome} VitestOutcome
 * @typedef {import('./worktree.mjs').RunCommand} RunCommand
 * @typedef {import('./worktree.mjs').Files} Files
 */

export const GENERATED_FOLDER = '.green-proof'
const VITEST_REPORT = 'vitest-run.json'
export const LCOV_FILE = 'lcov.info'

/**
 * @param {Files} files
 * @param {string} path
 * @returns {string} the file text, or '' when the file does not exist
 */
export function readOrEmpty(files, path) {
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
export function assertRanExactlyRedFiles(set, outcome, sha) {
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
 * @param {{ runCommand: RunCommand, files: Files }} context
 * @param {{ root: string, sha: string }} checkout
 * @param {{ files: string[], related?: boolean, coverage?: { include: string[], dir: string } }} request
 * @returns {VitestOutcome} any outcome except an error, which throws
 */
export function runVitest({ runCommand, files }, { root, sha }, request) {
  const jsonFile = join(root, GENERATED_FOLDER, VITEST_REPORT)
  files.removeFile(jsonFile)
  if (request.coverage !== undefined) {
    files.removeFile(join(root, request.coverage.dir, LCOV_FILE))
  }
  const result = runCommand('pnpm', vitestArgs({ ...request, jsonFile }), { cwd: root })
  const outcome = readVitestRun(result.status, readOrEmpty(files, jsonFile), root)
  if (outcome.outcome === 'error') {
    throw new Error(`Vitest error at ${shortSha(sha)}: ${outcome.detail}`)
  }
  return outcome
}
