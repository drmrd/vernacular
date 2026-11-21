/**
 * Check 4 of a GREEN proof: mutate the covered added lines and report each survivor as a warning.
 */

import { join } from 'node:path'
import { survivorFindings } from './mutation-report.mjs'
import {
  mutateRanges,
  mutationTargets,
  redVitestConfigText,
  strykerConfig,
  strykerGroups,
} from './mutation.mjs'
import { GENERATED_FOLDER } from './vitest-worktree.mjs'

/**
 * @typedef {import('../policy-check/git-input.mjs').AddedLine} AddedLine
 * @typedef {import('../policy-check/rule-severity.mjs').Finding} Finding
 * @typedef {import('./mutation.mjs').RangeGroup} RangeGroup
 * @typedef {import('./worktree.mjs').RunCommand} RunCommand
 * @typedef {import('./worktree.mjs').Files} Files
 * @typedef {{ sha: string, root: string, redFiles: string[] }} MutationProof the GREEN commit, its worktree, and the RED files that ran
 * @typedef {{ runCommand: RunCommand, files: Files, now: () => number }} MutationTools
 */

const RED_CONFIG = join(GENERATED_FOLDER, 'vitest.red.config.mjs')
const RUN_FAILED_RULE = 'mutation-run-failed'

/**
 * @param {string} text
 * @returns {string | undefined} the last non-blank line
 */
function lastLine(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => line !== '')
}

/**
 * @param {{ stdout: string, stderr: string }} output
 * @returns {string}
 */
function lastOutputLine({ stdout, stderr }) {
  return lastLine(stderr) ?? lastLine(stdout) ?? 'no output'
}

/**
 * @param {RangeGroup} target
 * @param {object} base the parsed Stryker base config
 * @param {{ proof: MutationProof, tools: MutationTools }} context
 * @returns {Finding[]}
 */
function mutateGroup({ group, ranges }, base, { proof, tools }) {
  const { sha, root } = proof
  const { runCommand, files } = tools
  const configFile = join(GENERATED_FOLDER, `stryker-${group}.json`)
  const reportFile = join(GENERATED_FOLDER, `mutation-${group}.json`)
  const config = strykerConfig(base, { group, ranges, vitestConfigFile: RED_CONFIG, reportFile })
  files.writeFile(join(root, configFile), JSON.stringify(config, null, 2))
  files.removeFile(join(root, reportFile))
  const run = runCommand('pnpm', ['exec', 'stryker', 'run', configFile], { cwd: root })
  if (run.status !== 0) {
    const message = `Stryker exited ${run.status} for the ${group} group: ${lastOutputLine(run)}`
    return [{ rule: RUN_FAILED_RULE, sha, message }]
  }
  try {
    return survivorFindings(files.readFile(join(root, reportFile)), { sha, root })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const message = `Stryker report for the ${group} group is unreadable: ${reason}`
    return [{ rule: RUN_FAILED_RULE, sha, message }]
  }
}

/**
 * @param {AddedLine[]} covered the covered added lines of the GREEN commit
 * @param {MutationProof} proof
 * @param {MutationTools} tools
 * @returns {{ findings: Finding[], elapsed: number } | undefined} undefined when no covered line is mutated
 */
export function checkMutation(covered, proof, tools) {
  const targets = mutationTargets(covered)
  if (targets.length === 0) return undefined
  const started = tools.now()
  tools.files.writeFile(join(proof.root, RED_CONFIG), redVitestConfigText(proof.redFiles))
  const base = JSON.parse(tools.files.readFile(join(proof.root, 'stryker.conf.json')))
  const findings = strykerGroups(mutateRanges(targets)).flatMap((target) =>
    mutateGroup(target, base, { proof, tools }),
  )
  return { findings, elapsed: tools.now() - started }
}
