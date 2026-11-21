/**
 * One temporary worktree that a GREEN proof moves from commit to commit.
 * @typedef {{ status: number, stdout: string, stderr: string }} CommandResult
 * @typedef {(command: string, args: readonly string[], options: { cwd: string }) => CommandResult} RunCommand
 * @typedef {(args: readonly string[]) => string} RunGit  throws on a nonzero git exit
 * @typedef {{ readFile(path: string): string, writeFile(path: string, text: string): void, makeTempDir(prefix: string): string, removeDir(path: string): void, removeFile(path: string): void }} Files
 */

import { join } from 'node:path'

const TEMP_PREFIX = 'green-proof-'
const WORKTREE_FOLDER = 'worktree'
const LOCKFILE = 'pnpm-lock.yaml'
const STDERR_TAIL_LINES = 20

/**
 * @typedef {{ runGit: RunGit, runCommand: RunCommand, files: Files, now: () => number }} Deps
 * @typedef {{ worktree: { tempDir: string, root: string, added: boolean } | null, lastInstalledBlob: string | null }} State
 */

/**
 * @param {Deps} deps
 * @returns {{ checkout(sha: string): { root: string, installMs: number }, dispose(): void }}
 */
export function createWorktreeSession(deps) {
  /** @type {State} */
  const state = { worktree: null, lastInstalledBlob: null }
  return {
    checkout(sha) {
      const root = moveTo(state, sha, deps)
      return { root, installMs: install(state, sha, deps) }
    },
    dispose() {
      dispose(state, deps)
    },
  }
}

/**
 * @param {RunGit} runGit
 * @param {readonly string[]} args
 * @param {{ sha: string, what: string }} step
 * @returns {string}
 */
function gitFor(runGit, args, { sha, what }) {
  try {
    return runGit(args)
  } catch (error) {
    throw new Error(`${what} failed for ${sha}: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * Checks out `sha`, adding the worktree on first use and moving it afterwards.
 * @param {State} state
 * @param {string} sha
 * @param {Deps} deps
 * @returns {string} the worktree root
 */
function moveTo(state, sha, deps) {
  const { runGit, files } = deps
  if (state.worktree === null) {
    const tempDir = files.makeTempDir(TEMP_PREFIX)
    state.worktree = { tempDir, root: join(tempDir, WORKTREE_FOLDER), added: false }
  }
  const worktree = state.worktree
  if (!worktree.added) {
    gitFor(runGit, ['worktree', 'add', '--detach', worktree.root, sha], {
      sha,
      what: 'git worktree add',
    })
    worktree.added = true
    return worktree.root
  }
  gitFor(runGit, ['-C', worktree.root, 'checkout', '--detach', '--force', sha], {
    sha,
    what: 'git checkout',
  })
  gitFor(runGit, ['-C', worktree.root, 'clean', '-fdx', '-e', 'node_modules'], {
    sha,
    what: 'git clean',
  })
  return worktree.root
}

/**
 * Installs dependencies unless the lockfile is unchanged since the last install.
 * @param {State} state
 * @param {string} sha
 * @param {Deps} deps
 * @returns {number} milliseconds spent installing
 */
function install(state, sha, deps) {
  const { runGit, runCommand, now } = deps
  const blob = gitFor(runGit, ['rev-parse', `${sha}:${LOCKFILE}`], {
    sha,
    what: 'git rev-parse',
  }).trim()
  if (blob === state.lastInstalledBlob) return 0
  state.lastInstalledBlob = null
  const started = now()
  const result = runCommand('pnpm', ['install', '--frozen-lockfile'], {
    cwd: state.worktree.root,
  })
  if (result.status !== 0) {
    throw new Error(`pnpm install failed for ${sha}: ${stderrTail(result.stderr)}`)
  }
  state.lastInstalledBlob = blob
  return now() - started
}

/**
 * @param {State} state
 * @param {Deps} deps
 */
function dispose(state, deps) {
  if (state.worktree === null) return
  const { tempDir, root } = state.worktree
  state.worktree = null
  state.lastInstalledBlob = null
  attempt(() => deps.runGit(['worktree', 'remove', '--force', root]))
  attempt(() => deps.files.removeDir(tempDir))
  attempt(() => deps.runGit(['worktree', 'prune']))
}

/**
 * @param {string} stderr
 * @returns {string}
 */
function stderrTail(stderr) {
  return stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n')
}

/**
 * @param {() => unknown} action
 */
function attempt(action) {
  try {
    action()
  } catch {
    // Cleanup keeps going when one step fails.
  }
}
