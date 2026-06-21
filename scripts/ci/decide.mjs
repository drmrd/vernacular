#!/usr/bin/env node
// scripts/ci/decide.mjs
//
// decide CLI: choose which heavy suites (e2e, visual, lighthouse) a run needs.
// merge_group and push always get the full set, because the merge queue is the
// backstop that keeps main green. Pull requests get a selective answer from the
// changed paths, the PR draft state, and override labels (read live so a
// slash-command label takes effect on a re-run). Dependency-injected for tests.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_BASE = 'origin/main'
const E2E_PATHS = ['app/', 'editor/', 'bridge/', 'engine/', 'e2e/']
const VISUAL_PATHS = ['editor/', 'bridge/react/', '.storybook/']
const VISUAL_SUFFIX = '.stories.tsx'

/** @typedef {{ e2e: boolean, visual: boolean, lighthouse: boolean }} Decision */

/**
 * @typedef {object} DecideDeps
 * @property {(args: readonly string[]) => string} runGit
 * @property {() => string[]} readLabels
 * @property {() => boolean} readDraft
 * @property {string} event
 * @property {(name: string, value: string) => void} setOutput
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} argv
 * @param {DecideDeps} deps
 * @returns {Promise<number>}
 */
export async function runDecide(argv, deps) {
  const decision = decide(argv, deps)
  deps.setOutput('e2e', String(decision.e2e))
  deps.setOutput('visual', String(decision.visual))
  deps.setOutput('lighthouse', String(decision.lighthouse))
  deps.log(
    `decide: e2e=${decision.e2e} visual=${decision.visual} lighthouse=${decision.lighthouse}`,
  )
  return 0
}

/**
 * @param {readonly string[]} argv
 * @param {DecideDeps} deps
 * @returns {Decision}
 */
function decide(argv, deps) {
  if (deps.event !== 'pull_request') {
    return { e2e: true, visual: true, lighthouse: true }
  }
  const labels = deps.readLabels()
  if (labels.includes('ci:full')) {
    return { e2e: true, visual: true, lighthouse: true }
  }
  if (labels.includes('ci:skip-heavy')) {
    return { e2e: false, visual: false, lighthouse: false }
  }
  const changed = changedFiles(deps.runGit, resolveBase(argv))
  const active = !deps.readDraft()
  return {
    e2e: labels.includes('run:e2e') || (active && touchesAny(changed, E2E_PATHS)),
    visual: labels.includes('run:visual') || (active && touchesVisual(changed)),
    lighthouse: false,
  }
}

/**
 * @param {string[]} changed
 * @param {readonly string[]} prefixes
 * @returns {boolean}
 */
function touchesAny(changed, prefixes) {
  return changed.some((file) => prefixes.some((prefix) => file.startsWith(prefix)))
}

/**
 * @param {string[]} changed
 * @returns {boolean}
 */
function touchesVisual(changed) {
  return changed.some(
    (file) =>
      file.endsWith(VISUAL_SUFFIX) || VISUAL_PATHS.some((prefix) => file.startsWith(prefix)),
  )
}

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function resolveBase(argv) {
  const flagIndex = argv.indexOf('--base')
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    return argv[flagIndex + 1]
  }
  return DEFAULT_BASE
}

/**
 * @param {(args: readonly string[]) => string} runGit
 * @param {string} base
 * @returns {string[]}
 */
function changedFiles(runGit, base) {
  return runGit(['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  const repo = process.env.GITHUB_REPOSITORY ?? ''
  const prNumber = process.env.PR_NUMBER ?? ''
  const ghJson = (apiPath) => JSON.parse(execFileSync('gh', ['api', apiPath], { encoding: 'utf8' }))
  runDecide(process.argv.slice(2), {
    runGit: (args) => execFileSync('git', args, { encoding: 'utf8' }),
    readLabels: () =>
      prNumber === ''
        ? []
        : ghJson(`repos/${repo}/issues/${prNumber}`).labels.map((label) => label.name),
    readDraft: () =>
      prNumber === '' ? false : ghJson(`repos/${repo}/pulls/${prNumber}`).draft === true,
    event: process.env.GITHUB_EVENT_NAME ?? '',
    setOutput: (name, value) =>
      appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/stdout', `${name}=${value}\n`),
    log: (line) => console.log(line),
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error)
      process.exit(2)
    })
}
