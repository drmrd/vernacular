import { describe, expect, it } from 'vitest'
import { cliScenario, green, parentOf, red, sha, textOf } from './green-proof-cli-test-support.mjs'
import { runGreenProof } from './green-proof.mjs'

const SHORT = 8
const short = (name) => sha(name).slice(0, SHORT)
const TEN_MINUTES_MS = 10 * 60 * 1000
const THREE_CYCLES = [red('r1'), green('g1'), red('r2'), green('g2'), red('r3'), green('g3')]
const RANGE = ['--range', 'main..topic']
const NOTE = 'mutation check not reached: the time budget was spent'

/** Three GREEN commits that each add a covered line; every Stryker call takes ten minutes. */
const budgeted = () =>
  cliScenario({ commits: THREE_CYCLES, mutating: { strykerMs: TEN_MINUTES_MS } })

describe('runGreenProof mutation budget', () => {
  it('mutates the newest GREEN commit first and lets a started run finish', async () => {
    const test = budgeted()
    await runGreenProof([...RANGE, '--mutation-budget-minutes', '15'], test.deps)
    expect(test.strykerCommits()).toEqual(['g3', 'g2'])
    const text = textOf(test.lines)
    const g1Block = text.slice(text.indexOf(`${short('g1')} `), text.indexOf(`${short('g2')} `))
    expect(g1Block).toContain(`note: ${NOTE}`)
    expect(text.split(NOTE)).toHaveLength(2)
  })

  it('still runs checks 1 to 3 on a cycle the budget did not reach', async () => {
    const test = budgeted()
    await runGreenProof([...RANGE, '--mutation-budget-minutes', '15'], test.deps)
    const vitestCalls = test.runCommand.calls.filter((call) => call.args[1] === 'vitest')
    expect(vitestCalls.length).toBeGreaterThanOrEqual(6)
    const checkouts = test.runGit.calls.filter((call) => call.includes('--detach')).flat()
    expect(checkouts).toContain(sha('g1'))
    expect(checkouts).toContain(parentOf('g1'))
    expect(test.strykerCommits()).not.toContain('g1')
    expect(textOf(test.lines)).toContain(`${short('g1')} proven`)
  })

  it('leaves the unreached note out of the GitHub annotations and exits 0', async () => {
    const test = cliScenario({
      commits: THREE_CYCLES,
      githubActions: true,
      mutating: { strykerMs: TEN_MINUTES_MS },
    })
    const status = await runGreenProof([...RANGE, '--mutation-budget-minutes', '15'], test.deps)
    expect(textOf(test.lines)).toContain(NOTE)
    expect(test.lines.filter((line) => line.startsWith('::') && line.includes(NOTE))).toEqual([])
    expect(status).toBe(0)
  })

  it('prints the cycles in range order and counts the unreached cycles in the header', async () => {
    const test = budgeted()
    const status = await runGreenProof([...RANGE, '--mutation-budget-minutes', '15'], test.deps)
    const text = textOf(test.lines)
    expect(status).toBe(0)
    expect(test.lines.find((line) => line.startsWith('green:proof:'))).toBe(
      'green:proof: 3 proven, 0 skipped, 0 failed in main..topic; cycles the mutation check did not reach: 1',
    )
    const at = (name) => text.indexOf(`  ${short(name)} proven`)
    expect(at('g1')).toBeGreaterThan(-1)
    expect(at('g2')).toBeGreaterThan(at('g1'))
    expect(at('g3')).toBeGreaterThan(at('g2'))
  })

  it.each(['0', 'x'])(
    'exits 2 when the budget is %j, not a whole number of minutes',
    async (value) => {
      const test = budgeted()
      const status = await runGreenProof([...RANGE, '--mutation-budget-minutes', value], test.deps)
      expect(status).toBe(2)
      expect(textOf(test.lines)).toContain(
        `green:proof: internal error: --mutation-budget-minutes needs a whole number of minutes greater than 0, got ${value}`,
      )
      expect(test.worktreeCalls('add')).toEqual([])
    },
  )

  it('mutates every cycle when no budget is given', async () => {
    const test = budgeted()
    await runGreenProof(RANGE, test.deps)
    expect(test.strykerCommits()).toHaveLength(3)
    const header = test.lines.find((line) => line.startsWith('green:proof:'))
    expect(header).toBe('green:proof: 3 proven, 0 skipped, 0 failed in main..topic')
  })
})
