import { describe, expect, it } from 'vitest'
import { authorFindings } from './commit-rules.mjs'

const OWNER_NAME = 'Dan Moore'
const OWNER_EMAIL = '9156191+drmrd@users.noreply.github.com'
const RELEASE_BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const DEPENDENCY_BOT_EMAIL = '49699333+dependabot[bot]@users.noreply.github.com'
const RELEASE_BRANCH = 'release-please--branches--main'
const DEPENDENCY_BRANCH = 'dependabot/npm_and_yarn/x'

/** @param {string} sha @param {string} authorName @param {string} authorEmail */
function commitBy(sha, authorName, authorEmail) {
  return { sha, authorName, authorEmail, subject: 'feat: add x', message: 'feat: add x' }
}

describe('authorFindings', () => {
  it('accepts commits by the owner identity', () => {
    const commit = commitBy('aaa', OWNER_NAME, OWNER_EMAIL)
    expect(authorFindings([commit], 'feat/x')).toEqual([])
  })

  it('refuses a commit whose name or email differs from the owner identity', () => {
    const wrongEmail = commitBy('bbb', OWNER_NAME, 'dan@example.com')
    const wrongName = commitBy('ccc', 'Someone Else', OWNER_EMAIL)
    const findings = authorFindings([wrongEmail, wrongName], 'feat/x')
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => [f.rule, f.sha])).toEqual([
      ['author-identity', 'bbb'],
      ['author-identity', 'ccc'],
    ])
    expect(findings[0].message).toContain('dan@example.com')
  })

  it('exempts a release-please commit on a release-please branch and a dependabot commit on a dependabot branch', () => {
    const release = commitBy('ddd', 'github-actions[bot]', RELEASE_BOT_EMAIL)
    const dependency = commitBy('eee', 'dependabot[bot]', DEPENDENCY_BOT_EMAIL)
    expect(authorFindings([release], RELEASE_BRANCH)).toEqual([])
    expect(authorFindings([dependency], DEPENDENCY_BRANCH)).toEqual([])
  })

  it("refuses a bot commit on a branch that is not that bot's", () => {
    const dependency = commitBy('fff', 'dependabot[bot]', DEPENDENCY_BOT_EMAIL)
    const release = commitBy('ggg', 'github-actions[bot]', RELEASE_BOT_EMAIL)
    const onFeature = authorFindings([dependency], 'feat/x')
    const onOtherBotBranch = authorFindings([release], DEPENDENCY_BRANCH)
    expect(onFeature).toHaveLength(1)
    expect(onFeature[0]).toMatchObject({ rule: 'author-identity', sha: 'fff' })
    expect(onOtherBotBranch).toHaveLength(1)
    expect(onOtherBotBranch[0]).toMatchObject({ rule: 'author-identity', sha: 'ggg' })
  })

  it('does not exempt a bot commit when the branch is unknown', () => {
    const dependency = commitBy('hhh', 'dependabot[bot]', DEPENDENCY_BOT_EMAIL)
    const findings = authorFindings([dependency], '')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'author-identity', sha: 'hhh' })
  })
})
