/**
 * The real git, command runner, file system, clock, and CI flag for the green:proof command.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { GIT_OUTPUT_LIMIT_BYTES } from '../policy-check/git-input.mjs'

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ cwd?: string }} options
 * @returns {import('./worktree.mjs').CommandResult}
 */
function spawnText(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
  })
  if (result.status === null) {
    throw new Error(
      `${command} did not exit normally (${result.signal ?? result.error?.message ?? 'unknown'})`,
    )
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * @param {readonly string[]} args
 * @returns {string}
 */
function runGit(args) {
  const result = spawnText('git', args, {})
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`)
  }
  return result.stdout
}

/** @type {import('./worktree.mjs').Files} */
const files = {
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile(path, text) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  },
  // The real path matters: on macOS the temporary folder sits behind a /var symlink.
  makeTempDir: (prefix) => realpathSync(mkdtempSync(join(tmpdir(), prefix))),
  removeDir: (path) => rmSync(path, { recursive: true, force: true }),
  removeFile: (path) => rmSync(path, { force: true }),
}

/** @returns {Omit<import('./green-proof.mjs').GreenProofDeps, 'onSession'>} */
export function defaultDeps() {
  return {
    runGit,
    runCommand: spawnText,
    files,
    log: (line) => console.log(line),
    githubActions: process.env.GITHUB_ACTIONS === 'true',
    now: () => performance.now(),
  }
}
