import { gitLog } from '../rgb-audit/cycle-audit-test-support.mjs'
import { fakeFiles, fakeGit, fakeRunner, reportOf } from './green-proof-test-support.mjs'

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

/**
 * Everything `runGreenProof` needs, over fake git, commands, and files.
 * `commits` are `red(...)` and `green(...)` entries in log order. `outcomes` maps a GREEN name to
 * `{ parent, green }`, each `'pass'` or `'fail'` (default `parent: 'fail'`, `green: 'pass'`).
 * `crashVitest` makes every Vitest run throw.
 * @param {{ commits: { name: string, subject: string, files: string[] }[], outcomes?: Record<string, { parent?: string, green?: string }>, crashVitest?: boolean, githubActions?: boolean }} setup
 */
export function cliScenario(setup) {
  const { commits, outcomes = {}, crashVitest = false, githubActions = false } = setup
  const files = fakeFiles()
  files.writeFile(`${WORKTREE_ROOT}/core/a.ts`, SOURCE_TEXT)
  const lines = []
  const state = { current: '' }
  const outcomeAt = (current) => {
    for (const { name } of commits) {
      const planned = outcomes[name] ?? {}
      if (current === sha(name)) return planned.green ?? 'pass'
      if (current === parentOf(name)) return planned.parent ?? 'fail'
    }
    return 'fail'
  }
  const runGit = fakeGit({
    respond(args) {
      const last = args.at(-1)
      if (args[0] === 'worktree' && args[1] === 'add') state.current = last
      if (args.includes('checkout')) state.current = last
      if (args[0] === 'log') {
        return {
          stdout: gitLog(
            commits.map((c) => ({ sha: sha(c.name), subject: c.subject, files: c.files })),
          ),
        }
      }
      if (args[0] === 'ls-tree') return lsTree(args)
      if (args[0] !== 'rev-parse' || last.includes(':')) return undefined
      if (last.endsWith('^{commit}'))
        return { stdout: `${sha(last.slice(0, -'^{commit}'.length))}\n` }
      if (last.endsWith('^')) return { stdout: `${parentOf(last.slice(0, -1))}\n` }
      return { stdout: `${sha(last)}\n` }
    },
  })
  const runCommand = fakeRunner({
    respond(command, args) {
      if (args.includes('--showConfig')) return { stdout: SHOW_CONFIG }
      if (args[1] !== 'vitest') return {}
      if (crashVitest) throw new Error('vitest crashed')
      const kind = outcomeAt(state.current)
      const flag = args.find((arg) => arg.startsWith(OUTPUT_FILE_FLAG))
      const text = reportOf([['core/a.test.ts', kind]]).replaceAll('/wt/', `${WORKTREE_ROOT}/`)
      files.writeFile(flag.slice(OUTPUT_FILE_FLAG.length), text)
      return { status: kind === 'pass' ? 0 : 1 }
    },
  })
  let clock = 0
  const deps = {
    runGit,
    runCommand,
    files,
    log: (text) => lines.push(text),
    githubActions,
    now: () => (clock += CLOCK_STEP_MS),
  }
  const worktreeCalls = (verb) => runGit.calls.filter((c) => c[0] === 'worktree' && c[1] === verb)
  return { deps, lines, runGit, runCommand, worktreeCalls }
}
