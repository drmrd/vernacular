const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

/** @typedef {{ sha: string, authorName: string, authorEmail: string, message: string }} FakeCommit */

/**
 * Build `git log --format=%x1e%H%x1f%an%x1f%ae%x1f%B` text from simple commit objects.
 * @param {readonly FakeCommit[]} commits
 * @returns {string}
 */
export function logText(commits) {
  return commits
    .map(
      (commit) =>
        `${RECORD_SEPARATOR}${commit.sha}${FIELD_SEPARATOR}${commit.authorName}${FIELD_SEPARATOR}${commit.authorEmail}${FIELD_SEPARATOR}${commit.message}\n`,
    )
    .join('')
}

/**
 * Build `git diff --unified=0` text that adds one line to a file.
 * @param {string} file
 * @param {number} line
 * @param {string} text
 * @returns {string}
 */
export function diffAddingLine(file, line, text) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${line - 1},0 +${line},1 @@`,
    `+${text}`,
    '',
  ].join('\n')
}

/**
 * A fake `runGit` that answers by the distinctive argument and records its calls.
 * Like real git, `show` throws for any ref other than `<head>:<path>` or a path not in `files`.
 * @param {{ commits?: readonly FakeCommit[], nameStatus?: string, diff?: string, files?: Record<string, string>, branch?: string, head?: string }} [answers]
 * @returns {{ runGit: (args: readonly string[]) => string, calls: string[][] }}
 */
export function fakeGit(answers = {}) {
  const {
    commits = [],
    nameStatus = '',
    diff = '',
    files = {},
    branch = 'feat/x',
    head = 'HEAD',
  } = answers
  /** @type {string[][]} */
  const calls = []
  /** @param {readonly string[]} args */
  function showFile(args) {
    const prefix = `${head}:`
    const spec = args[1] ?? ''
    const path = spec.slice(prefix.length)
    if (args.length !== 2 || !spec.startsWith(prefix) || !Object.hasOwn(files, path)) {
      throw new Error(`fatal: bad git show: ${args.join(' ')}`)
    }
    return files[path]
  }
  /** @param {readonly string[]} args */
  function runGit(args) {
    calls.push([...args])
    if (args.includes('log')) return logText(commits)
    if (args.includes('--name-status')) return nameStatus
    if (args.includes('--unified=0')) return diff
    if (args.includes('show')) return showFile(args)
    if (args.includes('rev-parse')) return `${branch}\n`
    throw new Error(`unexpected git call: ${args.join(' ')}`)
  }
  return { runGit, calls }
}

/**
 * Dependencies for `runPolicyCheck`: collects log lines, passes commitlint, no annotations.
 * @param {(args: readonly string[]) => string} runGit
 * @returns {{ deps: import('./policy-check.mjs').PolicyCheckDeps, lines: string[] }}
 */
export function collectingDeps(runGit) {
  /** @type {string[]} */
  const lines = []
  const deps = {
    runGit,
    runCommitlint: () => ({ status: 0, output: '' }),
    log: (/** @type {string} */ line) => lines.push(line),
    githubActions: false,
  }
  return { deps, lines }
}

export const OWNER_NAME = 'Dan Moore'
export const OWNER_EMAIL = '9156191+drmrd@users.noreply.github.com'

/** A commit by the owner that breaks no rule. */
export const CLEAN_COMMIT = {
  sha: 'a'.repeat(40),
  authorName: OWNER_NAME,
  authorEmail: OWNER_EMAIL,
  message: 'feat: add x',
}

/** Explicit range and branch arguments for `runPolicyCheck`. */
export const ARGV = ['--base', 'origin/main', '--head', 'HEAD', '--branch', 'feat/x']

/**
 * An added line, as the diff parser yields it.
 * @param {string} file
 * @param {number} line
 * @param {string} text
 */
export function added(file, line, text) {
  return { file, line, text }
}

/**
 * A changed file, as the name-status parser yields it.
 * @param {string} path
 * @param {string} [status]
 */
export function changed(path, status = 'M') {
  return { status, path }
}
