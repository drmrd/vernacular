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
      (c) =>
        `${RECORD_SEPARATOR}${c.sha}${FIELD_SEPARATOR}${c.authorName}${FIELD_SEPARATOR}${c.authorEmail}${FIELD_SEPARATOR}${c.message}\n`,
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
 * @param {{ commits?: readonly FakeCommit[], nameStatus?: string, diff?: string, files?: Record<string, string>, branch?: string }} [answers]
 * @returns {{ runGit: (args: readonly string[]) => string, calls: string[][] }}
 */
export function fakeGit(answers = {}) {
  const { commits = [], nameStatus = '', diff = '', files = {}, branch = 'feat/x' } = answers
  /** @type {string[][]} */
  const calls = []
  /** @param {readonly string[]} args */
  function runGit(args) {
    calls.push([...args])
    if (args.includes('log')) return logText(commits)
    if (args.includes('--name-status')) return nameStatus
    if (args.includes('--unified=0')) return diff
    if (args.includes('show')) return files[args[1].slice(args[1].indexOf(':') + 1)] ?? ''
    if (args.includes('rev-parse')) return `${branch}\n`
    throw new Error(`unexpected git call: ${args.join(' ')}`)
  }
  return { runGit, calls }
}

/**
 * Dependencies for `runPolicyCheck`: collects log lines, passes commitlint, no annotations.
 * @param {(args: readonly string[]) => string} runGit
 * @returns {{ deps: object, lines: string[] }}
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
