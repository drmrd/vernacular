import { describe, expect, it } from 'vitest'
import {
  ARGV as DEFAULT_ARGV,
  CLEAN_COMMIT,
  collectingDeps,
  fakeGit,
} from './fake-git-test-support.mjs'
import { runPolicyCheck } from './policy-check.mjs'

const ARGV = DEFAULT_ARGV.map((arg) => (arg === 'HEAD' ? 'abc123' : arg))

/**
 * Dependencies for a clean range whose commitlint answer and calls are controlled by the test.
 * @param {{ status: number, output: string }} answer
 */
function depsWithCommitlint(answer) {
  const { runGit } = fakeGit({ commits: [CLEAN_COMMIT], head: 'abc123' })
  const { deps, lines } = collectingDeps(runGit)
  /** @type {{ base: string, head: string }[]} */
  const commitlintCalls = []
  deps.runCommitlint = (options) => {
    commitlintCalls.push(options)
    return answer
  }
  return { deps, lines, commitlintCalls }
}

describe('runPolicyCheck commitlint', () => {
  it('lints the commit messages of the range with commitlint', async () => {
    const { deps, commitlintCalls } = depsWithCommitlint({ status: 0, output: '' })
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(0)
    expect(commitlintCalls).toEqual([{ base: 'origin/main', head: 'abc123' }])
  })

  it('fails the run and shows the commitlint output when it rejects a message', async () => {
    const output = 'subject may not be empty\ntype may not be empty'
    const { deps, lines, commitlintCalls } = depsWithCommitlint({ status: 1, output })
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(1)
    expect(commitlintCalls).toEqual([{ base: 'origin/main', head: 'abc123' }])
    const outputIndex = lines.findIndex((line) => line.includes('subject may not be empty'))
    expect(lines.some((line) => line.includes('type may not be empty'))).toBe(true)
    const findingIndex = lines.findIndex((line) => line.includes('[fail] [commit-message-format]'))
    expect(outputIndex).toBeGreaterThanOrEqual(0)
    expect(findingIndex).toBeGreaterThanOrEqual(0)
    expect(outputIndex).toBeLessThan(findingIndex)
  })

  it('keeps commitlint quiet when it accepts the range', async () => {
    const { deps, lines } = depsWithCommitlint({ status: 0, output: 'warning: body is long' })
    const code = await runPolicyCheck(ARGV, deps)
    expect(code).toBe(0)
    expect(lines.some((line) => line.includes('warning: body is long'))).toBe(false)
  })
})
