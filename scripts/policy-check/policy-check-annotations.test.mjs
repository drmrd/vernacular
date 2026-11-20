import { describe, expect, it } from 'vitest'
import { collectingDeps, fakeGit } from './fake-git-test-support.mjs'
import { runPolicyCheck } from './policy-check.mjs'
import { formatAnnotation } from './report.mjs'

const OWNER_NAME = 'Dan Moore'
const SHA = 'a'.repeat(40)
const ARGV = ['--base', 'origin/main', '--head', 'HEAD', '--branch', 'feat/x']

describe('formatAnnotation', () => {
  it('writes a failing finding as an error annotation with file and title', () => {
    const finding = { rule: 'spec-needs-adr', message: 'needs an ADR', file: 'docs/specs/x.md' }
    expect(formatAnnotation(finding, 'fail')).toBe(
      '::error file=docs/specs/x.md,title=spec-needs-adr::needs an ADR',
    )
  })

  it('writes a warning finding as a warning annotation with file, line, and title', () => {
    const finding = { rule: 'em-dash', message: 'avoid it', file: 'docs/a.md', line: 3 }
    expect(formatAnnotation(finding, 'warn')).toBe(
      '::warning file=docs/a.md,line=3,title=em-dash::avoid it',
    )
  })

  it('prefixes a commit finding with its short sha', () => {
    const finding = { rule: 'author-identity', message: 'wrong author', sha: SHA }
    expect(formatAnnotation(finding, 'fail')).toBe(
      '::error title=author-identity::aaaaaaaa wrong author',
    )
  })

  it('leaves the sha out of the message when the finding names a file', () => {
    const finding = { rule: 'em-dash', message: 'avoid it', file: 'docs/a.md', sha: SHA }
    expect(formatAnnotation(finding, 'warn')).toBe(
      '::warning file=docs/a.md,title=em-dash::avoid it',
    )
  })

  it('always includes the rule as the title, even with no location', () => {
    const finding = { rule: 'branch-prefix', message: 'bad branch' }
    expect(formatAnnotation(finding, 'fail')).toBe('::error title=branch-prefix::bad branch')
  })

  it('escapes newlines and percent signs in the message', () => {
    const finding = { rule: 'em-dash', message: '100% sure\r\nnext line' }
    expect(formatAnnotation(finding, 'warn')).toBe(
      '::warning title=em-dash::100%25 sure%0D%0Anext line',
    )
  })

  it('escapes colons and commas in property values as well as the message characters', () => {
    const finding = { rule: 'exact-pin', message: 'a: b, c', file: 'docs/a:b,c%d.md', line: 2 }
    expect(formatAnnotation(finding, 'fail')).toBe(
      '::error file=docs/a%3Ab%2Cc%25d.md,line=2,title=exact-pin::a: b, c',
    )
  })
})

describe('runPolicyCheck in GitHub Actions', () => {
  it('logs the summary unchanged and an annotation instead of the plain finding line', async () => {
    const stranger = {
      sha: SHA,
      authorName: OWNER_NAME,
      authorEmail: 'dan@example.com',
      message: 'feat: add x',
    }
    const { runGit } = fakeGit({ commits: [stranger] })
    const { deps, lines } = collectingDeps(runGit)
    const code = await runPolicyCheck(ARGV, { ...deps, githubActions: true })
    expect(code).toBe(1)
    expect(lines[0]).toBe(
      'policy:check: 1 failing and 0 warning finding(s) in origin/main..HEAD on feat/x',
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^::error title=author-identity::aaaaaaaa /)
    expect(lines.some((line) => line.includes('[fail]'))).toBe(false)
  })
})
