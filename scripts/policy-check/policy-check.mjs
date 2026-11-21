#!/usr/bin/env node
// scripts/policy-check/policy-check.mjs
//
// policy:check CLI: read a commit range from git, run every repository policy
// rule over it, and report findings, failing ones before warnings. Exit code 0
// means no failing finding; 1 means at least one; 2 means an internal fault.

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import commitlintConfig from '../../commitlint.config.js'
import { branchFindings } from './branch-rules.mjs'
import { authorFindings, trailerFindings } from './commit-rules.mjs'
import { e2eTimingFindings } from './e2e-rules.mjs'
import {
  GIT_OUTPUT_LIMIT_BYTES,
  parseCommitLog,
  parseNameStatus,
  parseUnifiedDiff,
} from './git-input.mjs'
import { milestoneCodeFindings } from './milestone-codes.mjs'
import { exactPinFindings } from './package-pins.mjs'
import { emDashFindings } from './prose-rules.mjs'
import { formatAnnotation, formatPlainLine } from './report.mjs'
import { severityOf } from './rule-severity.mjs'
import { specNeedsAdrFindings } from './spec-adr.mjs'

/** @typedef {import('./rule-severity.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').RunGit} RunGit */
/** @typedef {import('./git-input.mjs').ReadFile} ReadFile */

const EXIT_CLEAN = 0
const EXIT_FAILING_FINDINGS = 1
const EXIT_INTERNAL = 2
const DEFAULT_BASE = 'origin/main'
const DEFAULT_HEAD = 'HEAD'
const DETACHED_HEAD = 'HEAD'
const DETACHED_HEAD_NOTE = 'policy:check: detached HEAD, branch rules skipped; pass --branch <name>'
const TYPE_ENUM_VALUES_INDEX = 2
const FORK_PR_FLAG = '--fork-pr'
const AUTHOR_IDENTITY_RULE = 'author-identity'
const FORK_AUTHOR_IDENTITY_RULE = 'fork-author-identity'

/**
 * @typedef {object} PolicyCheckDeps
 * @property {RunGit} runGit
 * @property {(options: { base: string, head: string }) => { status: number, output: string }} runCommitlint
 * @property {(line: string) => void} log
 * @property {boolean} githubActions
 */

/**
 * @param {readonly string[]} argv arguments after the node binary and script path
 * @param {PolicyCheckDeps} deps
 * @returns {Promise<number>} the process exit code
 */
export async function runPolicyCheck(argv, { runGit, runCommitlint, log, githubActions }) {
  const base = flagValue(argv, '--base') ?? DEFAULT_BASE
  const head = flagValue(argv, '--head') ?? DEFAULT_HEAD
  const branch = resolveBranch(argv, runGit)
  if (branch === '') log(DETACHED_HEAD_NOTE)
  const rangeOnBranch = branch === '' ? `${base}..${head}` : `${base}..${head} on ${branch}`
  const commitlint = runCommitlint({ base, head })
  const findings = [
    ...ruleFindings(readRange({ runGit, base, head }), branch).map((finding) =>
      argv.includes(FORK_PR_FLAG) ? asForkFinding(finding) : finding,
    ),
    ...commitlintFindings(commitlint, `${base}..${head}`),
  ]
  return reportFindings({ findings, commitlint, rangeOnBranch, log, githubActions })
}

/**
 * @param {readonly string[]} argv
 * @param {RunGit} runGit
 * @returns {string} the branch name, or '' when HEAD is detached
 */
function resolveBranch(argv, runGit) {
  const resolvedBranch =
    flagValue(argv, '--branch') ?? runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  return resolvedBranch === DETACHED_HEAD ? '' : resolvedBranch
}

/**
 * @param {{
 *   findings: Finding[],
 *   commitlint: { status: number, output: string },
 *   rangeOnBranch: string,
 *   log: (line: string) => void,
 *   githubActions: boolean,
 * }} input
 * @returns {number} the process exit code
 */
function reportFindings({ findings, commitlint, rangeOnBranch, log, githubActions }) {
  const failing = findings.filter((finding) => severityOf(finding.rule) === 'fail')
  const warnings = findings.filter((finding) => severityOf(finding.rule) === 'warn')
  if (findings.length === 0) {
    log(`policy:check: clean (${rangeOnBranch})`)
    return EXIT_CLEAN
  }
  log(
    `policy:check: ${failing.length} failing and ${warnings.length} warning finding(s) in ${rangeOnBranch}`,
  )
  if (commitlint.status !== 0) for (const line of commitlint.output.split('\n')) log(line)
  const formatFinding = githubActions ? formatAnnotation : formatPlainLine
  for (const finding of failing) log(formatFinding(finding, 'fail'))
  for (const finding of warnings) log(formatFinding(finding, 'warn'))
  return failing.length === 0 ? EXIT_CLEAN : EXIT_FAILING_FINDINGS
}

/**
 * @typedef {object} RangeData
 * @property {import('./git-input.mjs').PolicyCommit[]} commits
 * @property {ReturnType<typeof parseNameStatus>} changedFiles
 * @property {ReturnType<typeof parseUnifiedDiff>} addedLines
 * @property {ReadFile} readFile
 */

/**
 * @param {{ runGit: RunGit, base: string, head: string }} input
 * @returns {RangeData}
 */
function readRange({ runGit, base, head }) {
  const diffArguments = ['-c', 'core.quotePath=false', 'diff']
  const commits = parseCommitLog(
    runGit([
      'log',
      '--reverse',
      '--no-merges',
      '--format=%x1e%H%x1f%an%x1f%ae%x1f%B',
      `${base}..${head}`,
    ]),
  )
  const changedFiles = parseNameStatus(
    runGit([...diffArguments, '--name-status', '--find-renames', `${base}...${head}`]),
  )
  const addedLines = parseUnifiedDiff(
    runGit([
      ...diffArguments,
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      '--find-renames',
      `${base}...${head}`,
    ]),
  )
  const readFile = (/** @type {string} */ path) => runGit(['show', `${head}:${path}`])
  return { commits, changedFiles, addedLines, readFile }
}

/**
 * @param {RangeData} range
 * @param {string} branch
 * @returns {Finding[]}
 */
function ruleFindings({ commits, changedFiles, addedLines, readFile }, branch) {
  const commitTypes = commitlintConfig.rules['type-enum'][TYPE_ENUM_VALUES_INDEX]
  return [
    ...trailerFindings(commits),
    ...authorFindings(commits, branch),
    ...branchFindings(branch, commitTypes),
    ...milestoneCodeFindings(commits, branch),
    ...emDashFindings(addedLines, readFile),
    ...exactPinFindings(changedFiles, readFile),
    ...specNeedsAdrFindings(changedFiles),
    ...e2eTimingFindings(addedLines),
  ]
}

/**
 * A fork pull request's author is reported as a warning, not a failure.
 * @param {Finding} finding
 * @returns {Finding}
 */
function asForkFinding(finding) {
  return finding.rule === AUTHOR_IDENTITY_RULE
    ? { ...finding, rule: FORK_AUTHOR_IDENTITY_RULE }
    : finding
}

/**
 * @param {{ status: number }} result
 * @param {string} range
 * @returns {Finding[]}
 */
function commitlintFindings({ status }, range) {
  if (status === 0) return []
  return [
    {
      rule: 'commit-message-format',
      message: `commitlint rejected at least one commit message in ${range}`,
    },
  ]
}

/**
 * @param {readonly string[]} argv
 * @param {string} flag
 * @returns {string | undefined}
 */
function flagValue(argv, flag) {
  const flagIndex = argv.indexOf(flag)
  return flagIndex !== -1 && flagIndex + 1 < argv.length ? argv[flagIndex + 1] : undefined
}

/**
 * @param {string} base
 * @param {string} head
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function spawnCommitlint(base, head) {
  const result = spawnSync('pnpm', ['exec', 'commitlint', '--from', base, '--to', head], {
    encoding: 'utf8',
  })
  if (result.status === null) {
    throw new Error(`commitlint did not exit normally (${result.signal ?? result.error})`)
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// Run only when invoked directly (node scripts/policy-check/policy-check.mjs ...),
// never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

/** @returns {PolicyCheckDeps} the real git, commitlint, console, and CI environment */
export function defaultDeps() {
  return {
    runGit: (args) =>
      execFileSync('git', args, { encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT_BYTES }),
    runCommitlint: ({ base, head }) => {
      const result = spawnCommitlint(base, head)
      return { status: result.status, output: `${result.stdout}${result.stderr}` }
    },
    log: (line) => console.log(line),
    githubActions: process.env.GITHUB_ACTIONS === 'true',
  }
}

if (isDirectInvocation) {
  runPolicyCheck(process.argv.slice(2), defaultDeps())
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exit(EXIT_INTERNAL)
    })
}
