import { describe, expect, it } from 'vitest'
import { collectingDeps, fakeGit } from './fake-git-test-support.mjs'
import { runPolicyCheck } from './policy-check.mjs'

const OWNER_NAME = 'Dan Moore'
const OWNER_EMAIL = '9156191+drmrd@users.noreply.github.com'
const CLEAN_COMMIT = {
  sha: 'a'.repeat(40),
  authorName: OWNER_NAME,
  authorEmail: OWNER_EMAIL,
  message: 'feat: add x',
}
const DETACHED_NOTE = 'policy:check: detached HEAD, branch rules skipped; pass --branch <name>'

/** @param {string[][]} calls */
function revParseCalls(calls) {
  return calls.filter((args) => args[0] === 'rev-parse')
}

describe('runPolicyCheck range and branch resolution', () => {
  it('defaults to origin/main..HEAD and the current branch', async () => {
    const { runGit, calls } = fakeGit({ commits: [CLEAN_COMMIT], branch: 'feat/x' })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck([], deps)
    expect(code).toBe(0)
    expect(lines[0]).toBe('policy:check: clean (origin/main..HEAD on feat/x)')
    expect(revParseCalls(calls)).toHaveLength(1)
  })

  it('takes base, head, and branch from flags without asking git for the branch', async () => {
    const { runGit, calls } = fakeGit({ commits: [CLEAN_COMMIT], head: 'topic' })
    const { deps, lines } = collectingDeps(runGit)
    const argv = ['--base', 'release', '--head', 'topic', '--branch', 'fix/y']
    const code = await runPolicyCheck(argv, deps)
    expect(code).toBe(0)
    expect(lines[0]).toBe('policy:check: clean (release..topic on fix/y)')
    expect(revParseCalls(calls)).toEqual([])
  })

  it('skips the branch rules on a detached HEAD and says so', async () => {
    const { runGit } = fakeGit({ commits: [CLEAN_COMMIT], branch: 'HEAD' })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck([], deps)
    expect(code).toBe(0)
    expect(lines.some((line) => line.includes('[branch-prefix]'))).toBe(false)
    expect(lines).toContain(DETACHED_NOTE)
  })

  it('logs the detached HEAD note before a summary without a branch name', async () => {
    const { runGit } = fakeGit({ commits: [CLEAN_COMMIT], branch: 'HEAD' })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck([], deps)
    expect(code).toBe(0)
    expect(lines).toEqual([DETACHED_NOTE, 'policy:check: clean (origin/main..HEAD)'])
  })
})
