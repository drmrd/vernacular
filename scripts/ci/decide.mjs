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
// The two lists below choose the heavy suites for a pull request.
//
// In, and why:
// - playwright.config.ts: it sets the projects, the port, the server, and the
//   retries of the end-to-end run.
// - playwright.stories.config.ts: it sets the story server, the snapshot path,
//   and the tolerance of the story visuals.
// - vite.config.ts: it shapes the build and the preview of the end-to-end run
//   and the story build; the check build proves only that it compiles.
// - vitest.config.ts: it defines the story test project, which runs only in the
//   story job.
// - src/: the bootstrap, the service worker, and the storage hook run in a
//   browser only in the end-to-end suite. src/setupTests.ts is also a setup file
//   of the story test project (through vite.config.ts), so it turns on the story
//   job too.
// - index.html: it is the entry document of the bundle that the suite loads.
// - public/: it is served at run time for the end-to-end suite, and it is copied
//   into the story build, where the stories use the mock service worker in it.
// - .storybook/: its main file, its preview, and its decorators shape every
//   story.
// - e2e/stories/: its spec and baselines run only in the story job. The e2e/
//   entry of the end-to-end list does not turn that job on.
// - scripts/serve-static.mjs: it is the server of the story visuals.
// - scripts/story-index.mjs: the story visual spec imports it.
// - pnpm-lock.yaml: it sets the version of every tool and library that a heavy
//   suite runs.
//
// Out on purpose:
// - tsconfig*.json: the typecheck and the build in the check job prove them; an
//   option that changes the emitted code is an accepted gap.
// - The rest of scripts/: its unit tests prove it.
// - package.json: a version change also changes the lockfile, and a release pull
//   request changes this file for the version alone; a change of a script alone
//   is an accepted gap.
// - lighthouserc.json: Lighthouse never runs on a pull request.
// - .nvmrc: the check job proves the Node version.
//
// Not decided yet:
// - core/, storage/, and .github/workflows/ can each change a heavy suite.
//   ADR-0171 states the open choices for them.
const E2E_PATHS = [
  'app/',
  'editor/',
  'bridge/',
  'engine/',
  'e2e/',
  'playwright.config.ts',
  'vite.config.ts',
  'index.html',
  'src/',
  'public/',
  'pnpm-lock.yaml',
]
const VISUAL_PATHS = [
  'editor/',
  'bridge/react/',
  '.storybook/',
  'playwright.stories.config.ts',
  'e2e/stories/',
  'vite.config.ts',
  'vitest.config.ts',
  'public/',
  'src/setupTests.ts',
  'scripts/serve-static.mjs',
  'scripts/story-index.mjs',
  'pnpm-lock.yaml',
]
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
