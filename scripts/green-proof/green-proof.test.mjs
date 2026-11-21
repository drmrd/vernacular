import { describe, expect, it } from 'vitest'
import { cliScenario, green, parentOf, red, sha, textOf } from './green-proof-cli-test-support.mjs'
import { runGreenProof } from './green-proof.mjs'

const LOG_FORMAT = '%x1e%H%x1f%s%x1f%(trailers:key=Infrastructure,valueonly,separator=%x20)'
const SHORT = 8
const short = (name) => sha(name).slice(0, SHORT)
const ONE_CYCLE = [red('r1'), green('g1')]
const FAILING = { g1: { parent: 'pass', green: 'pass' } }

describe('runGreenProof', () => {
  it('reads the range with the rgb:audit log format and without merge commits', async () => {
    const test = cliScenario({ commits: ONE_CYCLE })
    await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(test.runGit.calls).toContainEqual([
      'log',
      '--reverse',
      '--no-merges',
      'main..topic',
      `--pretty=format:${LOG_FORMAT}`,
      '--name-only',
    ])
    const defaulted = cliScenario({ commits: ONE_CYCLE })
    await runGreenProof([], defaulted.deps)
    expect(defaulted.runGit.calls.some((call) => call.includes('origin/main..HEAD'))).toBe(true)
  })

  it('exits 0 without a worktree when the range has no GREEN commit', async () => {
    const test = cliScenario({ commits: [red('r1')] })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(status).toBe(0)
    expect(textOf(test.lines)).toContain('green:proof: no GREEN commit in main..topic')
    expect(test.worktreeCalls('add')).toEqual([])
  })

  it('exits 1 and prints the finding when a cycle fails', async () => {
    const test = cliScenario({ commits: ONE_CYCLE, outcomes: FAILING })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(status).toBe(1)
    const text = textOf(test.lines)
    expect(text).toContain('green:proof: 0 proven, 0 skipped, 1 failed in main..topic')
    expect(text).toContain('  [fail] [red-passes-before-green]')
    expect(test.worktreeCalls('remove')).toHaveLength(1)
  })

  it('lists each cycle with its result, skip reason, and step times', async () => {
    const test = cliScenario({ commits: [...ONE_CYCLE, green('g2')] })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(status).toBe(0)
    const text = textOf(test.lines)
    expect(text).toContain('green:proof: 1 proven, 1 skipped, 0 failed in main..topic')
    expect(text).toContain(`  ${short('g1')} proven feat: add g1`)
    expect(text).toContain(
      `  ${short('g2')} skipped feat: add g2 (no RED commit before this GREEN commit)`,
    )
    expect(text).toMatch(
      /^ {4}time: install \d+\.\d s, parent \d+\.\d s, type-check \d+\.\d s, green \d+\.\d s, mutation \d+\.\d s$/m,
    )
  })

  it('puts failing findings before warnings and counts each status in the header', async () => {
    const mixed = red('r1', ['core/a.test.ts', 'e2e/tests/a.spec.ts'])
    const test = cliScenario({
      commits: [mixed, green('g1'), red('r2'), green('g2')],
      outcomes: { g1: { parent: 'pass', green: 'pass' }, g2: { parent: 'pass', green: 'pass' } },
    })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    const text = textOf(test.lines)
    expect(status).toBe(1)
    expect(text).toContain('green:proof: 1 proven, 0 skipped, 1 failed in main..topic')
    const failAt = text.indexOf('[fail] [red-passes-before-green]')
    const warnAt = text.indexOf('[warn] [mixed-red-passes-before-green]')
    expect(failAt).toBeGreaterThan(-1)
    expect(warnAt).toBeGreaterThan(failAt)
  })

  it('proves only the named commit with --commit', async () => {
    const test = cliScenario({ commits: [red('r1'), green('g1'), red('r2'), green('g2')] })
    const status = await runGreenProof(['--commit', 'g2', '--base', 'main'], test.deps)
    expect(status).toBe(0)
    expect(test.runGit.calls).toContainEqual([
      'log',
      '--reverse',
      '--no-merges',
      `main..${sha('g2')}`,
      `--pretty=format:${LOG_FORMAT}`,
      '--name-only',
    ])
    const checkouts = test.runGit.calls.filter((c) => c.includes('--detach')).flat()
    expect(checkouts).toEqual(expect.arrayContaining([parentOf('g2'), sha('g2')]))
    expect(checkouts).not.toContain(sha('g1'))
    expect(checkouts).not.toContain(parentOf('g1'))
    expect(textOf(test.lines)).toContain('green:proof: 1 proven, 0 skipped, 0 failed')
  })

  it('reads the range <base>..HEAD when --base is given without --commit', async () => {
    const test = cliScenario({ commits: ONE_CYCLE })
    await runGreenProof(['--base', 'main'], test.deps)
    expect(test.runGit.calls).toContainEqual([
      'log',
      '--reverse',
      '--no-merges',
      'main..HEAD',
      `--pretty=format:${LOG_FORMAT}`,
      '--name-only',
    ])
  })

  it('resolves --commit with a verified, option-safe rev-parse of the commit', async () => {
    const test = cliScenario({ commits: [red('r1'), green('g2')] })
    await runGreenProof(['--commit', 'g2', '--base', 'main'], test.deps)
    expect(test.runGit.calls).toContainEqual([
      'rev-parse',
      '--verify',
      '--end-of-options',
      'g2^{commit}',
    ])
  })

  it('exits 2 naming the commit when --commit is not a GREEN commit in the range', async () => {
    const test = cliScenario({ commits: ONE_CYCLE })
    const status = await runGreenProof(['--commit', 'r1', '--base', 'main'], test.deps)
    expect(status).toBe(2)
    expect(textOf(test.lines)).toMatch(new RegExp(`green:proof: internal error: .*${short('r1')}`))
    expect(test.worktreeCalls('add')).toEqual([])
  })

  it.each([
    [['--bogus']],
    [['--range']],
    [['--range', 'a..b', '--commit', 'x']],
    [['--constructor', 'x']],
    [['--toString', 'x']],
  ])('exits 2 without a worktree for the bad arguments %j', async (argv) => {
    const test = cliScenario({ commits: ONE_CYCLE })
    const status = await runGreenProof(argv, test.deps)
    expect(status).toBe(2)
    expect(textOf(test.lines)).toContain('green:proof: internal error:')
    expect(test.worktreeCalls('add')).toEqual([])
  })

  it('removes the worktree and exits 2 when a step throws', async () => {
    const test = cliScenario({ commits: ONE_CYCLE, crashVitest: true })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(status).toBe(2)
    expect(textOf(test.lines)).toContain('green:proof: internal error:')
    expect(test.worktreeCalls('add')).toHaveLength(1)
    expect(test.worktreeCalls('remove')).toHaveLength(1)
    expect(test.deps.files.removed).toHaveLength(1)
  })

  it('writes GitHub annotations when running in GitHub Actions', async () => {
    const test = cliScenario({ commits: ONE_CYCLE, outcomes: FAILING, githubActions: true })
    const status = await runGreenProof(['--range', 'main..topic'], test.deps)
    expect(status).toBe(1)
    expect(textOf(test.lines)).toContain('::error title=red-passes-before-green::')
  })
})
