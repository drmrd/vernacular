import { describe, expect, it } from 'vitest'
import { collectingDeps, diffAddingLine, fakeGit } from './fake-git-test-support.mjs'
import { runPolicyCheck } from './policy-check.mjs'
import { RULE_SEVERITY, severityOf } from './rule-severity.mjs'

const OWNER_NAME = 'Dan Moore'
const OWNER_EMAIL = '9156191+drmrd@users.noreply.github.com'
const ARGV = ['--base', 'origin/main', '--head', 'HEAD', '--branch', 'feat/x']
const EM_DASH = '—'

/** @param {string} sha @param {string} authorEmail */
function commitBy(sha, authorEmail) {
  return { sha, authorName: OWNER_NAME, authorEmail, message: 'feat: add x' }
}

const CLEAN_COMMIT = commitBy('a'.repeat(40), OWNER_EMAIL)

describe('rule severity table', () => {
  it('states every rule severity in one table', () => {
    expect(RULE_SEVERITY).toEqual({
      'commit-message-format': 'fail',
      'forbidden-trailer': 'fail',
      'author-identity': 'fail',
      'branch-prefix': 'fail',
      'spec-needs-adr': 'fail',
      'exact-pin': 'fail',
      ordering: 'fail',
      independence: 'fail',
      blue: 'fail',
      'test-scope': 'fail',
      'refactor-scope': 'fail',
      'milestone-code': 'warn',
      'em-dash': 'warn',
      'e2e-timing-or-focus': 'warn',
    })
  })

  it('refuses an unknown rule id', () => {
    expect(() => severityOf('nope')).toThrow('unknown policy rule: nope')
  })
})

describe('runPolicyCheck', () => {
  it('reports a clean range and exits 0', async () => {
    const { runGit } = fakeGit({ commits: [CLEAN_COMMIT] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(0)
    expect(lines[0]).toBe('policy:check: clean (origin/main..HEAD on feat/x)')
  })

  it('exits 1 and names the rule when a failing rule fires', async () => {
    const stranger = commitBy('a'.repeat(40), 'dan@example.com')
    const { runGit } = fakeGit({ commits: [stranger] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('[fail] [author-identity] aaaaaaaa: ')
  })

  it('exits 0 when only warning rules fire', async () => {
    const { runGit } = fakeGit({
      commits: [CLEAN_COMMIT],
      nameStatus: 'A\tdocs/a.md\n',
      diff: diffAddingLine('docs/a.md', 3, `A note ${EM_DASH} with a dash`),
      files: { 'docs/a.md': `# A\n\nA note ${EM_DASH} with a dash\n` },
    })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(0)
    expect(lines.join('\n')).toContain('[warn] [em-dash] docs/a.md:3: ')
  })

  it('reads commits without merges and changes from the merge base', async () => {
    const { runGit, calls } = fakeGit({ commits: [CLEAN_COMMIT] })
    const { deps } = collectingDeps(runGit)
    await runPolicyCheck(ARGV, deps)
    expect(calls).toContainEqual([
      'log',
      '--reverse',
      '--no-merges',
      '--format=%x1e%H%x1f%an%x1f%ae%x1f%B',
      'origin/main..HEAD',
    ])
    expect(calls).toContainEqual([
      '-c',
      'core.quotePath=false',
      'diff',
      '--name-status',
      '--find-renames',
      'origin/main...HEAD',
    ])
    expect(calls).toContainEqual([
      '-c',
      'core.quotePath=false',
      'diff',
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      '--find-renames',
      'origin/main...HEAD',
    ])
  })
})
