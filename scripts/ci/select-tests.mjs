#!/usr/bin/env node
// scripts/ci/select-tests.mjs
//
// select-tests CLI: from the files changed since the PR base, pick the Vitest
// path filters for the unit suite. Sound at layer granularity because
// eslint-plugin-boundaries forbids upward imports (see scripts/ci/layers.mjs);
// non-code couplings live in ci-coupling.json. Output modes:
//   all  -> run the whole unit suite (a global input changed)
//   some -> run `paths` only
//   none -> no unit-bearing files changed; the merge queue still runs all.
// Dependency-injected for tests; the shell at the bottom wires real deps.

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { affectedLayers, layerOf } from './layers.mjs'

const DEFAULT_BASE = 'origin/main'
const EXTRA_TEST_DIRS = ['tests', 'scripts']

/**
 * @typedef {object} SelectDeps
 * @property {(args: readonly string[]) => string} runGit
 * @property {() => { runAll?: string[], runAllPrefixes?: string[], edges?: Record<string, string[]> }} readCoupling
 * @property {(name: string, value: string) => void} setOutput
 * @property {(line: string) => void} log
 */

/**
 * @param {readonly string[]} argv
 * @param {SelectDeps} deps
 * @returns {Promise<number>}
 */
export async function runSelectTests(argv, deps) {
  const { mode, paths } = select(argv, deps)
  deps.setOutput('mode', mode)
  deps.setOutput('paths', paths.join(' '))
  deps.log(`select-tests: mode=${mode}${paths.length > 0 ? ` paths=${paths.join(' ')}` : ''}`)
  return 0
}

/**
 * @param {readonly string[]} argv
 * @param {SelectDeps} deps
 * @returns {{ mode: 'all' | 'some' | 'none', paths: string[] }}
 */
function select(argv, deps) {
  const base = resolveBase(argv)
  const changed = changedFiles(deps.runGit, base)
  if (changed.length === 0) {
    return { mode: 'none', paths: [] }
  }
  const coupling = deps.readCoupling()
  if (changed.some((file) => isRunAll(file, coupling))) {
    return { mode: 'all', paths: [] }
  }
  const dirs = selectionDirs(changed, coupling)
  return dirs.length === 0 ? { mode: 'none', paths: [] } : { mode: 'some', paths: dirs }
}

/**
 * @param {string[]} changed
 * @param {{ edges?: Record<string, string[]> }} coupling
 * @returns {string[]} sorted, de-duplicated path filters
 */
function selectionDirs(changed, coupling) {
  const layers = new Set()
  for (const file of changed) {
    const layer = layerOf(file)
    if (layer !== null) {
      layers.add(layer)
    }
    for (const [prefix, added] of Object.entries(coupling.edges ?? {})) {
      if (file.startsWith(prefix)) {
        for (const extra of added) {
          layers.add(extra)
        }
      }
    }
  }
  const dirs = affectedLayers(layers).map((layer) => `${layer}/`)
  for (const dir of EXTRA_TEST_DIRS) {
    if (changed.some((file) => file.startsWith(`${dir}/`))) {
      dirs.push(`${dir}/`)
    }
  }
  return [...new Set(dirs)].sort()
}

/**
 * @param {string} file
 * @param {{ runAll?: string[], runAllPrefixes?: string[] }} coupling
 * @returns {boolean}
 */
function isRunAll(file, coupling) {
  if ((coupling.runAll ?? []).includes(file)) {
    return true
  }
  return (coupling.runAllPrefixes ?? []).some((prefix) => file.startsWith(prefix))
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
  const raw = runGit(['diff', '--name-only', `${base}...HEAD`])
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

// Run only when invoked directly, never when imported by a test.
const invokedPath = process.argv[1]
const isDirectInvocation =
  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath

if (isDirectInvocation) {
  runSelectTests(process.argv.slice(2), {
    runGit: (args) => execFileSync('git', args, { encoding: 'utf8' }),
    readCoupling: () => JSON.parse(readFileSync('ci-coupling.json', 'utf8')),
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
