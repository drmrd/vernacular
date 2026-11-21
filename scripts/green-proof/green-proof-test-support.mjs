/** @typedef {import('./worktree.mjs').CommandResult} CommandResult */

import { proveCycle } from './prove-cycle.mjs'

export const ROOT = '/wt'
export const GREEN = 'green1234567890'
export const PARENT = 'parent1234567890'
const SHOW_CONFIG = JSON.stringify({ files: ['./src/vite-env.d.ts'] })
export const LCOV_FILE = `${ROOT}/.green-proof/coverage/lcov.info`
const OUTPUT_FILE_FLAG = '--outputFile='
const OCTAL_RADIX = 8
const ASCII_LIMIT = 128

/** @returns {{ sha: string, type: string, scope: string, subject: string, files: string[], infra: boolean }} */
export const commit = (sha, type, files) => ({
  sha,
  type,
  scope: '',
  subject: 'x',
  files,
  infra: false,
})

/**
 * A Vitest JSON report over `[file, kind]` entries, kind being `'pass'`, `'fail'`, or `'noload'`.
 * @param {[string, string][]} entries
 */
export function reportOf(entries) {
  const count = (kind) => entries.filter((entry) => entry[1] === kind).length
  const testResults = entries.map(([file, kind]) => {
    const result = { name: `${ROOT}/${file}`, message: '', assertionResults: [] }
    if (kind === 'pass') return { ...result, status: 'passed' }
    if (kind === 'noload') {
      return { ...result, status: 'failed', message: "SyntaxError: no export named 'x'" }
    }
    const assertion = { fullName: 'a rejects bad input', status: 'failed' }
    return { ...result, status: 'failed', assertionResults: [assertion] }
  })
  return JSON.stringify({
    numTotalTestSuites: entries.length,
    numFailedTests: count('fail'),
    numFailedTestSuites: count('noload'),
    numPassedTests: count('pass'),
    testResults,
  })
}

/** A Vitest JSON report of one file: `'pass'`, `'fail'`, `'noload'`, or `'empty'`. */
export function report(kind, file = 'core/a.test.ts') {
  return reportOf(kind === 'empty' ? [] : [[file, kind]])
}

/**
 * A `git show --unified=0` diff. Each entry is `[path, { start, added, removed }]`: the hunk
 * removes `removed` lines and adds `added` lines, the first added line being line `start`.
 * @param {[string, { start: number, added?: string[], removed?: string[] }][]} entries
 */
export function diffOf(entries) {
  return entries
    .flatMap(([path, { start, added = [], removed = [] }]) => [
      `diff --git a/${path} b/${path}`,
      'index 1111111..2222222 100644',
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -${start},${removed.length} +${start},${added.length} @@`,
      ...removed.map((text) => `-${text}`),
      ...added.map((text) => `+${text}`),
    ])
    .join('\n')
    .concat('\n')
}

/**
 * lcov text over `[file, [[line, hits], ...]]` entries, with absolute `SF:` paths under the worktree.
 * @param {[string, [number, number][]][]} entries
 */
export function lcovOf(entries) {
  return entries
    .flatMap(([file, hits]) => [
      `SF:${ROOT}/${file}`,
      ...hits.map(([line, count]) => `DA:${line},${count}`),
      'end_of_record',
    ])
    .join('\n')
    .concat('\n')
}

/** Git quotes a path with non-ASCII bytes as C-style octal escapes unless `-z` is given. */
function quoted(path) {
  if ([...Buffer.from(path)].every((byte) => byte < ASCII_LIMIT)) return path
  const escaped = [...Buffer.from(path)].map((byte) =>
    byte < ASCII_LIMIT ? String.fromCharCode(byte) : `\\${byte.toString(OCTAL_RADIX)}`,
  )
  return `"${escaped.join('')}"`
}

/**
 * A fake `runGit` that records each call's argv in `calls`.
 * `rev-parse <sha>:pnpm-lock.yaml` answers `blobs[sha]` plus a newline; every other call answers ''.
 * A call throws an Error when its argv joined with spaces contains any string of `failOn`.
 * An optional `respond(args)` runs after `failOn`; it may return `{ status, stdout, stderr }`
 * (a nonzero status throws, like the real `runGit`) or undefined to use the defaults above.
 * @param {{ blobs?: Record<string, string>, failOn?: readonly string[], respond?: (args: readonly string[]) => (Partial<CommandResult> | undefined) }} [answers]
 * @returns {((args: readonly string[]) => string) & { calls: string[][] }}
 */
export function fakeGit(answers = {}) {
  const { blobs = {}, failOn = [], respond } = answers
  const calls = []
  const runGit = (args) => {
    calls.push([...args])
    const line = args.join(' ')
    if (failOn.some((needle) => line.includes(needle))) {
      throw new Error(`fake git failed: ${line}`)
    }
    const answer = respond?.(args)
    if (answer !== undefined) {
      if ((answer.status ?? 0) !== 0)
        throw new Error(`fake git failed: ${line}\n${answer.stderr ?? ''}`)
      return answer.stdout ?? ''
    }
    if (args[0] === 'rev-parse') {
      const sha = args[1].split(':')[0]
      return `${blobs[sha] ?? 'blob-default'}\n`
    }
    return ''
  }
  return Object.assign(runGit, { calls })
}

/**
 * A fake `runCommand` that records `{ command, args, options }` in `calls`.
 * Each call takes the next entry of `results` (missing fields default to a clean exit).
 * An optional `respond(command, args, options)` runs first, after the call is recorded. It may
 * throw, write into a shared `fakeFiles` (a Vitest JSON report, tsc output), and return a partial
 * result, or return undefined to fall back to `results`.
 * @param {{ results?: readonly Partial<CommandResult>[], respond?: (command: string, args: readonly string[], options: { cwd: string }) => (Partial<CommandResult> | undefined) }} [answers]
 */
export function fakeRunner(answers = {}) {
  const { results = [], respond } = answers
  const calls = []
  const runCommand = (command, args, options) => {
    const index = calls.length
    calls.push({ command, args: [...args], options })
    const next = respond?.(command, args, options) ?? results[index] ?? {}
    return { status: 0, stdout: '', stderr: '', ...next }
  }
  return Object.assign(runCommand, { calls })
}

/**
 * An in-memory `Files`. `makeTempDir` answers `/fake-tmp/<prefix><n>`; `removed` lists removed folders.
 * `removeFile` deletes one file (a later `readFile` throws).
 */
export function fakeFiles() {
  const contents = new Map()
  const madeDirs = []
  const removed = []
  const removedFiles = []
  return {
    madeDirs,
    removed,
    removedFiles,
    readFile(path) {
      if (!contents.has(path)) throw new Error(`no such file: ${path}`)
      return contents.get(path)
    },
    writeFile(path, text) {
      contents.set(path, text)
    },
    removeFile(path) {
      removedFiles.push(path)
      contents.delete(path)
    },
    makeTempDir(prefix) {
      const dir = `/fake-tmp/${prefix}${madeDirs.length + 1}`
      madeDirs.push(dir)
      return dir
    },
    removeDir(path) {
      removed.push(path)
    },
  }
}

/** The Vitest exit status of a fake run: 0 only when every test passed. */
function exitStatusOf(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return 1
  }
  const failed = parsed.numFailedTests + parsed.numFailedTestSuites
  return failed === 0 && parsed.numPassedTests > 0 ? 0 : 1
}

/**
 * A whole cycle of one GREEN commit over RED commits, with fake git, commands, and files.
 * `parent` and `green` are the Vitest reports of the two runs. A report of `{ exit }` writes no
 * report file and exits with that status. `gone` lists RED files absent at the GREEN commit.
 * `diff` answers the GREEN commit's `git show`, `lcov` is the coverage file a run that asks for
 * coverage leaves (none when undefined), `state.runs` records the files removed since the previous Vitest run, and
 * `greenFiles` lists the files the GREEN commit changes.
 * @param {{ reds?: string[][], diff?: string, lcov?: string, greenFiles?: string[], parent?: string | { exit: number }, green?: string | { exit: number }, gone?: string[],
 *   tsc?: { status?: number, stdout?: string }, showConfig?: string }} setup
 */
export function scenario(setup = {}) {
  const { reds = [['core/a.test.ts']], gone = [], tsc = {}, showConfig = SHOW_CONFIG } = setup
  const { diff = '', lcov, greenFiles = ['core/a.ts'] } = setup
  const reports = { [PARENT]: setup.parent, [GREEN]: setup.green }
  const files = fakeFiles()
  const state = { current: '', checkouts: [], runs: [] }
  let removalsSeen = 0
  const session = {
    checkout(sha) {
      state.current = sha
      state.checkouts.push(sha)
      return { root: ROOT, installMs: 0 }
    },
    dispose() {},
  }
  const runGit = fakeGit({
    respond(args) {
      if (args[0] === 'rev-parse' && args[1] === `${GREEN}^`) return { stdout: `${PARENT}\n` }
      if (args.includes('show')) return { stdout: diff }
      if (args[0] !== 'ls-tree') return undefined
      const paths = args.slice(args.indexOf('--') + 1).filter((path) => !gone.includes(path))
      if (args.includes('-z')) return { stdout: paths.map((path) => `${path}\0`).join('') }
      return { stdout: paths.map((path) => `${quoted(path)}\n`).join('') }
    },
  })
  const runCommand = fakeRunner({
    respond(command, args) {
      if (args[1] === 'vitest') {
        const flag = args.find((arg) => arg.startsWith(OUTPUT_FILE_FLAG))
        const planned = reports[state.current]
        state.runs.push({ removedFiles: files.removedFiles.slice(removalsSeen) })
        removalsSeen = files.removedFiles.length
        if (lcov !== undefined && args.some((arg) => arg.startsWith('--coverage'))) {
          files.writeFile(LCOV_FILE, lcov)
        }
        if (planned === undefined) return { status: 1 }
        if (typeof planned !== 'string') return { status: planned.exit }
        files.writeFile(flag.slice(OUTPUT_FILE_FLAG.length), planned)
        return { status: exitStatusOf(planned) }
      }
      return args.includes('--showConfig') ? { stdout: showConfig } : tsc
    },
  })
  let clock = 0
  const context = { runGit, runCommand, files, session, now: () => (clock += 1) }
  const cycle = {
    green: commit(GREEN, 'feat', greenFiles),
    reds: reds.map((f, i) => commit(`red${i}`, 'test', f)),
  }
  const tscCalls = () =>
    runCommand.calls.filter((c) => c.args[1] === 'tsc' && !c.args.includes('--showConfig'))
  const vitestCalls = () => runCommand.calls.filter((c) => c.args[1] === 'vitest')
  return { cycle, context, state, tscCalls, vitestCalls, run: () => proveCycle(cycle, context) }
}
