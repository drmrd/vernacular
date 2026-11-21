import { describe, expect, it } from 'vitest'
import {
  ARGV,
  CLEAN_COMMIT,
  OWNER_EMAIL,
  OWNER_NAME,
  collectingDeps,
  diffAddingLine,
  fakeGit,
} from './fake-git-test-support.mjs'
import { runPolicyCheck } from './policy-check.mjs'
import { RULE_SEVERITY, severityOf } from './rule-severity.mjs'

const CLEAN_SHA = 'a'.repeat(40)
const EM_DASH = '\u2014'

/** @param {string} sha @param {string} authorEmail @param {string} [message] */
function commitBy(sha, authorEmail, message = 'feat: add x') {
  return { sha, authorName: OWNER_NAME, authorEmail, message }
}

/** @param {string[]} lines @param {string} rule */
function linesFor(lines, rule) {
  return lines.filter((line) => line.includes(`[${rule}]`))
}

const EM_DASH_ANSWERS = {
  commits: [CLEAN_COMMIT],
  nameStatus: 'A\tdocs/a.md\n',
  diff: diffAddingLine('docs/a.md', 3, `A note ${EM_DASH} with a dash`),
  files: { 'docs/a.md': `# A\n\nA note ${EM_DASH} with a dash\n` },
}

const RANGE_MANIFEST = JSON.stringify({ dependencies: { alpha: '^1.2.3' } }, null, 2)
const E2E_FILE = 'e2e/tests/walls.spec.ts'
const E2E_LINE = 7
const SHORT_SHA = 'aaaaaaaa: '

const RULE_CASES = [
  {
    rule: 'forbidden-trailer',
    severity: 'fail',
    location: SHORT_SHA,
    setup: {
      commits: [commitBy(CLEAN_SHA, OWNER_EMAIL, 'feat: add x\n\nCo-authored-by: X <x@y>')],
    },
  },
  {
    rule: 'branch-prefix',
    severity: 'fail',
    location: '',
    setup: {
      commits: [CLEAN_COMMIT],
      argv: ['--base', 'origin/main', '--head', 'HEAD', '--branch', 'feature/x'],
    },
  },
  {
    rule: 'milestone-code',
    severity: 'warn',
    location: SHORT_SHA,
    setup: { commits: [commitBy(CLEAN_SHA, OWNER_EMAIL, 'feat: finish M3 walls')] },
  },
  {
    rule: 'exact-pin',
    severity: 'fail',
    location: 'package.json:3: ',
    setup: {
      commits: [CLEAN_COMMIT],
      nameStatus: 'M\tpackage.json\n',
      files: { 'package.json': RANGE_MANIFEST },
    },
  },
  {
    rule: 'spec-needs-adr',
    severity: 'fail',
    location: 'docs/specs/x.md: ',
    setup: {
      commits: [CLEAN_COMMIT],
      nameStatus: 'M\tdocs/specs/x.md\n',
      files: { 'docs/specs/x.md': '# X\n' },
    },
  },
  {
    rule: 'e2e-timing-or-focus',
    severity: 'warn',
    location: `${E2E_FILE}:${E2E_LINE}: `,
    setup: {
      commits: [CLEAN_COMMIT],
      nameStatus: `M\t${E2E_FILE}\n`,
      diff: diffAddingLine(E2E_FILE, E2E_LINE, '  await page.waitForTimeout(500)'),
      files: { [E2E_FILE]: '' },
    },
  },
]

describe('rule severity table', () => {
  it('states every rule severity in one table', () => {
    expect(Object.isFrozen(RULE_SEVERITY)).toBe(true)
    expect(RULE_SEVERITY).toEqual({
      'commit-message-format': 'fail',
      'forbidden-trailer': 'fail',
      'author-identity': 'fail',
      'fork-author-identity': 'warn',
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
    const stranger = commitBy(CLEAN_SHA, 'dan@example.com')
    const { runGit } = fakeGit({ commits: [stranger] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(1)
    expect(lines[0]).toBe(
      'policy:check: 1 failing and 0 warning finding(s) in origin/main..HEAD on feat/x',
    )
    expect(lines.join('\n')).toContain('[fail] [author-identity] aaaaaaaa: ')
  })

  it('reports a non-owner author as a warning and exits 0 on a fork pull request', async () => {
    const strangers = [commitBy(CLEAN_SHA, 'dan@example.com'), commitBy('b'.repeat(40), 'x@y.z')]
    const { runGit } = fakeGit({ commits: strangers })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck([...ARGV, '--fork-pr'], deps)
    expect(code).toBe(0)
    expect(lines[0]).toContain('0 failing and 2 warning finding(s)')
    expect(linesFor(lines, 'fork-author-identity')).toHaveLength(2)
    expect(linesFor(lines, 'author-identity')).toHaveLength(0)
    expect(lines.join('\n')).toContain('[warn] [fork-author-identity] aaaaaaaa: ')
  })

  it('still fails a non-owner author without the fork flag', async () => {
    const { runGit } = fakeGit({ commits: [commitBy(CLEAN_SHA, 'dan@example.com')] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('[fail] [author-identity] aaaaaaaa: ')
    expect(linesFor(lines, 'fork-author-identity')).toHaveLength(0)
  })

  it('keeps failing every other rule on a fork pull request', async () => {
    const trailer = 'feat: add x\n\nCo-authored-by: X <x@y>'
    const { runGit } = fakeGit({ commits: [commitBy(CLEAN_SHA, 'dan@example.com', trailer)] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck([...ARGV, '--fork-pr'], deps)
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('[warn] [fork-author-identity] aaaaaaaa: ')
    expect(lines.join('\n')).toContain('[fail] [forbidden-trailer] aaaaaaaa: ')
  })

  it('exits 0 when only warning rules fire', async () => {
    const { runGit } = fakeGit(EM_DASH_ANSWERS)
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(0)
    expect(lines[0]).toBe(
      'policy:check: 0 failing and 1 warning finding(s) in origin/main..HEAD on feat/x',
    )
    expect(lines.join('\n')).toContain('[warn] [em-dash] docs/a.md:3: ')
  })

  it('logs the summary first and every failing line before any warning line', async () => {
    const stranger = commitBy(CLEAN_SHA, 'dan@example.com', 'feat: finish M3 walls')
    const { runGit } = fakeGit({
      ...EM_DASH_ANSWERS,
      commits: [stranger],
      nameStatus: 'A\tdocs/a.md\nM\tpackage.json\n',
      files: { ...EM_DASH_ANSWERS.files, 'package.json': '{"dependencies":{"alpha":"^1.2.3"}}' },
    })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(1)
    expect(lines[0]).toBe(
      'policy:check: 2 failing and 2 warning finding(s) in origin/main..HEAD on feat/x',
    )
    const severities = lines.slice(1).map((line) => line.trim().slice(1, 5))
    expect(severities).toEqual(['fail', 'fail', 'warn', 'warn'])
    expect(linesFor(lines, 'exact-pin')).toHaveLength(1)
    expect(linesFor(lines, 'milestone-code')).toHaveLength(1)
  })

  it('reads each changed file from the head ref and nothing else', async () => {
    const { runGit, calls } = fakeGit(EM_DASH_ANSWERS)
    const { deps } = collectingDeps(runGit)
    await runPolicyCheck(ARGV, deps)
    expect(calls.filter((args) => args.includes('show'))).toEqual([['show', 'HEAD:docs/a.md']])
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

  it.each(RULE_CASES)(
    'reaches the $rule rule through a run',
    async ({ rule, severity, location, setup }) => {
      const { argv = ARGV, ...answers } = setup
      const { runGit } = fakeGit(answers)
      const { deps, lines } = collectingDeps(runGit)
      const code = await runPolicyCheck(argv, deps)
      const found = linesFor(lines, rule)
      expect(found).toHaveLength(1)
      expect(found[0].startsWith(`  [${severity}] [${rule}] ${location}`)).toBe(true)
      expect(code).toBe(severity === 'fail' ? 1 : 0)
    },
  )
})
