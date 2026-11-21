import { gitLog } from '../rgb-audit/cycle-audit-test-support.mjs'
import { STRYKER_BASE, strykerAnswer } from './green-proof-stryker-test-support.mjs'
import {
  CONTROL_RECORD,
  ROOT,
  diffOf,
  fakeFiles,
  fakeGit,
  fakeRunner,
  lcovOf,
  reportOf,
} from './green-proof-test-support.mjs'

export const WORKTREE_ROOT = '/fake-tmp/green-proof-1/worktree'
const SHOW_CONFIG = JSON.stringify({ files: ['./src/vite-env.d.ts'] })
const OUTPUT_FILE_FLAG = '--outputFile='
const CLOCK_STEP_MS = 1000
const SHA_LENGTH = 12
const SOURCE_TEXT = 'export const x = 1\n'

/** A fake full sha for a short name, so `sha('g1')` is `g10000000000`. */
export const sha = (name) => name.padEnd(SHA_LENGTH, '0')

/** The sha that a fake `git rev-parse <green>^` answers. */
export const parentOf = (name) => `parent-${sha(name)}`

/** A RED commit that changes unit test files. */
export const red = (name, files = ['core/a.test.ts']) => ({ name, subject: 'test: x', files })

/** A GREEN commit that changes one source file. */
export const green = (name) => ({ name, subject: `feat: add ${name}`, files: ['core/a.ts'] })

/** Joined text of everything `log` received. */
export const textOf = (lines) => lines.join('\n')

/** The paths a fake `git ls-tree` answers: every requested path exists. */
function lsTree(args) {
  const paths = args.slice(args.indexOf('--') + 1)
  if (args.includes('-z')) return { stdout: paths.map((path) => `${path}\0`).join('') }
  return { stdout: paths.map((path) => `${path}\n`).join('') }
}

const ADDED_LINE = diffOf([['core/a.ts', { start: 7, added: ['const x = 1'] }]])
const COVERED_LINE =
  CONTROL_RECORD + lcovOf([['core/a.ts', [[7, 1]]]]).replaceAll(ROOT, WORKTREE_ROOT)
const LCOV_PATH = `${WORKTREE_ROOT}/.green-proof/coverage/lcov.info`

/** The Vitest outcome of the commit that is checked out: `'pass'` or `'fail'`. */
function outcomeFor(commits, outcomes, current) {
  for (const { name } of commits) {
    const planned = outcomes[name] ?? {}
    if (current === sha(name)) return planned.green ?? 'pass'
    if (current === parentOf(name)) return planned.parent ?? 'fail'
  }
  return 'fail'
}

/** The fake `git rev-parse` answers, or undefined for any other call. */
function revParse(args) {
  const last = args.at(-1)
  if (args[0] !== 'rev-parse' || last.includes(':')) return undefined
  if (last.endsWith('^{commit}')) return { stdout: `${sha(last.slice(0, -'^{commit}'.length))}\n` }
  if (last.endsWith('^')) return { stdout: `${parentOf(last.slice(0, -1))}\n` }
  return { stdout: `${sha(last)}\n` }
}

/** The fake `runGit`; with `mutating`, every `git show` adds one line of `core/a.ts`. */
function gitFor(setup, state) {
  const { commits, mutating } = setup
  return fakeGit({
    respond(args) {
      const last = args.at(-1)
      if (args[0] === 'worktree' && args[1] === 'add') state.current = last
      if (args.includes('checkout')) state.current = last
      if (args[0] === 'log') {
        const entries = commits.map((c) => ({
          sha: sha(c.name),
          subject: c.subject,
          files: c.files,
        }))
        return { stdout: gitLog(entries) }
      }
      if (args.includes('show') && mutating) return { stdout: ADDED_LINE }
      if (args[0] === 'ls-tree') return lsTree(args)
      return revParse(args)
    },
  })
}

/** The fake `runCommand`: Vitest answers by commit, and with `mutating` Stryker moves the clock. */
function commandsFor(setup, run) {
  const { commits, outcomes, crashVitest, mutating } = setup
  const { state, files, advance, strykerRuns } = run
  return fakeRunner({
    respond(command, args) {
      if (args.includes('--showConfig')) return { stdout: SHOW_CONFIG }
      if (args[1] === 'stryker' && mutating) {
        strykerRuns.push(state.current)
        return strykerAnswer(args[3], {}, { root: WORKTREE_ROOT, files, advance, ...mutating })
      }
      if (args[1] !== 'vitest') return {}
      if (crashVitest) throw new Error('vitest crashed')
      const kind = outcomeFor(commits, outcomes, state.current)
      const flag = args.find((arg) => arg.startsWith(OUTPUT_FILE_FLAG))
      const text = reportOf([['core/a.test.ts', kind]]).replaceAll('/wt/', `${WORKTREE_ROOT}/`)
      files.writeFile(flag.slice(OUTPUT_FILE_FLAG.length), text)
      if (mutating && args.some((arg) => arg.startsWith('--coverage')))
        files.writeFile(LCOV_PATH, COVERED_LINE)
      return { status: kind === 'pass' ? 0 : 1 }
    },
  })
}

/**
 * Everything `runGreenProof` needs, over fake git, commands, and files.
 * `commits` are `red(...)` and `green(...)` entries in log order. `outcomes` maps a GREEN name to
 * `{ parent, green }`, each `'pass'` or `'fail'` (default `parent: 'fail'`, `green: 'pass'`).
 * `crashVitest` makes every Vitest run throw.
 * `mutating` (default off, so existing output is unchanged) is `{ strykerMs }`: each GREEN commit
 * then adds one covered `core/a.ts` line, a base `stryker.conf.json` exists, and every Stryker
 * call exits 0 with an empty report and moves the fake clock by `strykerMs`. The result's
 * `strykerCommits()` names the GREEN commit checked out at each Stryker call, in call order.
 * @param {{ commits: { name: string, subject: string, files: string[] }[], outcomes?: Record<string, { parent?: string, green?: string }>, crashVitest?: boolean, githubActions?: boolean, mutating?: { strykerMs: number } }} setup
 */
export function cliScenario(setup) {
  const { githubActions = false, outcomes = {}, crashVitest = false, mutating } = setup
  const { commits } = setup
  const files = fakeFiles()
  files.writeFile(`${WORKTREE_ROOT}/core/a.ts`, SOURCE_TEXT)
  files.writeFile(`${WORKTREE_ROOT}/stryker.conf.json`, JSON.stringify(STRYKER_BASE))
  const lines = []
  const state = { current: '' }
  const strykerRuns = []
  let clock = 0
  const advance = (ms) => (clock += ms)
  const resolved = { commits, outcomes, crashVitest, mutating }
  const runGit = gitFor(resolved, state)
  const runCommand = commandsFor(resolved, { state, files, advance, strykerRuns })
  const deps = {
    runGit,
    runCommand,
    files,
    log: (text) => lines.push(text),
    githubActions,
    now: () => advance(CLOCK_STEP_MS),
  }
  const worktreeCalls = (verb) => runGit.calls.filter((c) => c[0] === 'worktree' && c[1] === verb)
  const strykerCommits = () =>
    strykerRuns.map((current) => commits.find((c) => sha(c.name) === current)?.name ?? current)
  return { deps, lines, runGit, runCommand, worktreeCalls, strykerCommits }
}
