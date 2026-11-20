import { describe, expect, it } from 'vitest'
import { branchFindings } from './branch-rules.mjs'

const TYPES = ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf', 'build', 'ci']

describe('branchFindings', () => {
  it('accepts a branch named after any commit type', () => {
    for (const branch of ['feat/policy-checks-in-ci', 'test/share-fixtures', 'ci/run-x']) {
      expect(branchFindings(branch, TYPES)).toEqual([])
    }
  })

  it('accepts the release-please and dependabot branches', () => {
    const releaseBranch = 'release-please--branches--main--components--vernacular'
    expect(branchFindings(releaseBranch, TYPES)).toEqual([])
    expect(branchFindings('dependabot/npm_and_yarn/x', TYPES)).toEqual([])
  })

  it('refuses a branch without a commit-type prefix', () => {
    for (const branch of ['feature/x', 'integration/preview', 'main']) {
      const findings = branchFindings(branch, TYPES)
      expect(findings).toHaveLength(1)
      expect(findings[0].rule).toBe('branch-prefix')
      expect(findings[0]).not.toHaveProperty('sha')
    }
  })

  it('refuses a prefix with nothing after the slash', () => {
    const findings = branchFindings('feat/', TYPES)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('branch-prefix')
    expect(findings[0]).not.toHaveProperty('sha')
  })

  it('skips the rule when the branch is unknown', () => {
    expect(branchFindings('', TYPES)).toEqual([])
  })
})
