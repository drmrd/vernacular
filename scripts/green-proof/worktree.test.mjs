import { describe, expect, it } from 'vitest'
import { fakeFiles, fakeGit, fakeRunner } from './green-proof-test-support.mjs'
import { createWorktreeSession } from './worktree.mjs'

const TMP = '/fake-tmp/green-proof-1'
const ROOT = `${TMP}/worktree`
const INSTALL = ['install', '--frozen-lockfile']

function setup({ blobs = {}, failOn = [], results = [] } = {}) {
  const runGit = fakeGit({ blobs, failOn })
  const runCommand = fakeRunner({ results })
  const files = fakeFiles()
  let clock = 0
  const now = () => (clock += 5)
  const session = createWorktreeSession({ runGit, runCommand, files, now })
  return { session, runGit, runCommand, files }
}

const installCalls = (runCommand) =>
  runCommand.calls.filter((call) => call.command === 'pnpm' && call.args[0] === 'install')

describe('createWorktreeSession', () => {
  it('adds a detached worktree under a new temporary folder on the first checkout', () => {
    const { session, runGit, files } = setup()
    const result = session.checkout('aaa')
    expect(files.madeDirs).toEqual([TMP])
    expect(runGit.calls).toContainEqual(['worktree', 'add', '--detach', ROOT, 'aaa'])
    expect(result.root).toBe(ROOT)
  })

  it('checks out later commits in the same worktree', () => {
    const { session, runGit, files } = setup()
    session.checkout('aaa')
    const second = session.checkout('bbb')
    expect(files.madeDirs).toEqual([TMP])
    expect(second.root).toBe(ROOT)
    expect(runGit.calls).toContainEqual(['-C', ROOT, 'checkout', '--detach', '--force', 'bbb'])
    expect(runGit.calls.filter((call) => call[0] === 'worktree' && call[1] === 'add')).toHaveLength(
      1,
    )
  })

  it('installs once for each different lockfile', () => {
    const { session, runCommand } = setup({ blobs: { a: 'one', b: 'one', c: 'two' } })
    const first = session.checkout('a')
    const second = session.checkout('b')
    session.checkout('c')
    expect(installCalls(runCommand)).toEqual([
      { command: 'pnpm', args: INSTALL, options: { cwd: ROOT } },
      { command: 'pnpm', args: INSTALL, options: { cwd: ROOT } },
    ])
    expect(first.installMs).toBeGreaterThan(0)
    expect(second.installMs).toBe(0)
  })

  it('reads the lockfile blob of the checked-out commit with rev-parse', () => {
    const { session, runGit } = setup()
    session.checkout('aaa')
    expect(runGit.calls).toContainEqual(['rev-parse', 'aaa:pnpm-lock.yaml'])
  })

  it('throws an error naming the sha and the stderr when the install fails', () => {
    const { session } = setup({ results: [{ status: 1, stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' }] })
    expect(() => session.checkout('badsha')).toThrow(/\bbadsha\b.*ERR_PNPM_OUTDATED_LOCKFILE/s)
  })

  it('throws an error naming the sha when git worktree add fails', () => {
    const { session, files } = setup({ failOn: ['worktree add'] })
    expect(() => session.checkout('addfail')).toThrow(Error)
    expect(() => session.checkout('addfail')).toThrow(/\baddfail\b/)
    expect(files.madeDirs).toEqual([TMP])
    session.dispose()
    expect(files.removed).toEqual([TMP])
  })

  it('throws an error naming the sha when a later git checkout fails', () => {
    const { session } = setup({ failOn: ['checkout --detach'] })
    session.checkout('aaa')
    expect(() => session.checkout('cofail')).toThrow(/\bcofail\b/)
  })

  it('throws an error naming the sha when the lockfile blob cannot be read, and skips the install', () => {
    const { session, runCommand } = setup({ failOn: ['rev-parse'] })
    expect(() => session.checkout('noblob')).toThrow(/\bnoblob\b/)
    expect(installCalls(runCommand)).toEqual([])
  })

  it('does not record a failed install, so the same lockfile installs again', () => {
    const { session, runCommand } = setup({
      blobs: { a: 'one', b: 'one' },
      results: [{ status: 1, stderr: 'boom' }],
    })
    expect(() => session.checkout('a')).toThrow(/pnpm install failed for a\b/)
    session.checkout('b')
    expect(installCalls(runCommand)).toHaveLength(2)
  })

  it('installs again after a failed install, because node_modules may be half installed', () => {
    const { session, runCommand } = setup({
      blobs: { a: 'one', b: 'two', c: 'one' },
      results: [{}, { status: 1, stderr: 'boom' }],
    })
    session.checkout('a')
    expect(() => session.checkout('b')).toThrow(/pnpm install failed for b\b/)
    session.checkout('c')
    expect(installCalls(runCommand)).toHaveLength(3)
  })

  it('cleans untracked and ignored files except node_modules after each later checkout', () => {
    const { session, runGit } = setup()
    const cleanArgv = ['-C', ROOT, 'clean', '-fdx', '-e', 'node_modules']
    session.checkout('aaa')
    expect(runGit.calls).not.toContainEqual(cleanArgv)
    session.checkout('bbb')
    expect(runGit.calls.filter((call) => call.includes('clean'))).toEqual([cleanArgv])
    session.checkout('ccc')
    expect(runGit.calls.filter((call) => call.includes('clean'))).toEqual([cleanArgv, cleanArgv])
  })

  it('removes the worktree and the temporary folder when disposed, even after a failed install', () => {
    const { session, runGit, files } = setup({ results: [{ status: 1, stderr: 'boom' }] })
    expect(() => session.checkout('aaa')).toThrow()
    session.dispose()
    expect(runGit.calls).toContainEqual(['worktree', 'remove', '--force', ROOT])
    expect(files.removed).toEqual([TMP])
    expect(runGit.calls.at(-1)).toEqual(['worktree', 'prune'])
  })

  it('keeps disposing when a git call throws', () => {
    const { session, runGit, files } = setup({ failOn: ['worktree remove'] })
    session.checkout('aaa')
    expect(() => session.dispose()).not.toThrow()
    expect(files.removed).toEqual([TMP])
    expect(runGit.calls.at(-1)).toEqual(['worktree', 'prune'])
  })

  it('does nothing on dispose when nothing was checked out, and tolerates a second dispose', () => {
    const { session, runGit, files } = setup()
    session.dispose()
    expect(runGit.calls).toEqual([])
    expect(files.removed).toEqual([])
    session.checkout('aaa')
    session.dispose()
    const callCount = runGit.calls.length
    session.dispose()
    expect(runGit.calls).toHaveLength(callCount)
    expect(files.removed).toEqual([TMP])
  })
})
