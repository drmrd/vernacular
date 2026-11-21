/**
 * One temporary worktree that a GREEN proof moves from commit to commit.
 * @typedef {{ status: number, stdout: string, stderr: string }} CommandResult
 * @typedef {(command: string, args: readonly string[], options: { cwd: string }) => CommandResult} RunCommand
 * @typedef {(args: readonly string[]) => string} RunGit  throws on a nonzero git exit
 * @typedef {{ readFile(path: string): string, writeFile(path: string, text: string): void, makeTempDir(prefix: string): string, removeDir(path: string): void }} Files
 */

import { join } from 'node:path'

const TEMP_PREFIX = 'green-proof-'
const WORKTREE_FOLDER = 'worktree'
const LOCKFILE = 'pnpm-lock.yaml'
const STDERR_TAIL_LINES = 20

/**
 * @param {{ runGit: RunGit, runCommand: RunCommand, files: Files, now: () => number }} deps
 * @returns {{ checkout(sha: string): { root: string, installMs: number }, dispose(): void }}
 */
export function createWorktreeSession(deps) {
  const { runGit, runCommand, files, now } = deps
  /** @type {{ tempDir: string, root: string, added: boolean } | null} */
  let created = null
  let lastInstalledBlob = null

  const git = (sha, what, args) => {
    try {
      return runGit(args)
    } catch (error) {
      throw new Error(
        `${what} failed for ${sha}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  const addWorktree = (sha) => {
    if (created === null) {
      const tempDir = files.makeTempDir(TEMP_PREFIX)
      created = { tempDir, root: join(tempDir, WORKTREE_FOLDER), added: false }
    }
    git(sha, 'git worktree add', ['worktree', 'add', '--detach', created.root, sha])
    created.added = true
  }

  const moveTo = (sha) => {
    if (created === null || !created.added) {
      addWorktree(sha)
      return
    }
    git(sha, 'git checkout', ['-C', created.root, 'checkout', '--detach', '--force', sha])
    git(sha, 'git clean', ['-C', created.root, 'clean', '-fdx', '-e', 'node_modules'])
  }

  const install = (sha, root) => {
    const blob = git(sha, 'git rev-parse', ['rev-parse', `${sha}:${LOCKFILE}`]).trim()
    if (blob === lastInstalledBlob) return 0
    lastInstalledBlob = null
    const started = now()
    const result = runCommand('pnpm', ['install', '--frozen-lockfile'], { cwd: root })
    if (result.status !== 0) {
      throw new Error(`pnpm install failed for ${sha}: ${stderrTail(result.stderr)}`)
    }
    lastInstalledBlob = blob
    return now() - started
  }

  return {
    checkout(sha) {
      moveTo(sha)
      const root = created.root
      return { root, installMs: install(sha, root) }
    },
    dispose() {
      if (created === null) return
      const { tempDir, root } = created
      created = null
      lastInstalledBlob = null
      attempt(() => runGit(['worktree', 'remove', '--force', root]))
      attempt(() => files.removeDir(tempDir))
      attempt(() => runGit(['worktree', 'prune']))
    },
  }
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
