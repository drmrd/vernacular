import { describe, expect, it } from 'vitest'
import { redVitestConfigText } from './mutation.mjs'
import { MUTATION_NOT_REACHED_NOTE } from './mutation-budget.mjs'
import { GREEN, diffOf, lcovOf, report, scenario } from './green-proof-test-support.mjs'

const ROOT = '/wt'
const ADDED = diffOf([['core/a.ts', { start: 7, added: ['const x = 1'] }]])
const COVERED = lcovOf([['core/a.ts', [[7, 1]]]])
const SCRIPT_DIFF = diffOf([
  ['core/a.ts', { start: 7, added: ['const x = 1'] }],
  ['scripts/x.mjs', { start: 3, added: ['const y = 2'] }],
])
const BOTH_COVERED = lcovOf([
  ['core/a.ts', [[7, 1]]],
  ['scripts/x.mjs', [[3, 1]]],
])
const FIXTURES = 'core/x-test-fixtures.ts'
const RED_CONFIG = `${ROOT}/.green-proof/vitest.red.config.mjs`
const REPORT_FILE = `${ROOT}/.green-proof/mutation-app.json`
const STRYKER_ARGS = ['exec', 'stryker', 'run', '.green-proof/stryker-app.json']

/** A Stryker JSON report with one mutant of the given status on `file` line `line`. */
const strykerReport = (status, file = 'core/a.ts', line = 7) =>
  JSON.stringify({
    files: {
      [file]: {
        mutants: [
          {
            id: '1',
            mutatorName: 'ConditionalExpression',
            replacement: 'true',
            status,
            location: { start: { line, column: 1 }, end: { line, column: 9 } },
          },
        ],
      },
    },
  })

/** A scenario whose RED test fails at the parent and passes at GREEN, with line 7 covered. */
const mutating = (setup) =>
  scenario({
    parent: report('fail'),
    green: report('pass'),
    diff: ADDED,
    lcov: COVERED,
    ...setup,
  })

const writtenJson = (test, path) => JSON.parse(test.context.files.readFile(`${ROOT}/${path}`))
/** A budget that records its calls and answers `canStart` with `allowed`. */
function fakeBudget(allowed) {
  const calls = []
  return {
    calls,
    canStart() {
      calls.push(['canStart'])
      return allowed
    },
    spend(ms) {
      calls.push(['spend', ms])
    },
  }
}
const rules = (result) => result.findings.map((finding) => finding.rule)

describe('proveCycle mutation check', () => {
  it('runs Stryker over the covered added lines with only the RED tests', () => {
    const test = mutating({ strykerBase: { testRunner: 'vitest', distinctiveKey: 'kept' } })
    test.run()
    expect(test.strykerCalls()).toEqual([
      { command: 'pnpm', args: STRYKER_ARGS, options: { cwd: ROOT } },
    ])
    const config = writtenJson(test, '.green-proof/stryker-app.json')
    expect(config).toMatchObject({
      distinctiveKey: 'kept',
      mutate: ['core/a.ts:7-7'],
      vitest: { configFile: '.green-proof/vitest.red.config.mjs' },
      jsonReporter: { fileName: '.green-proof/mutation-app.json' },
      incremental: false,
    })
    const vitestConfig = test.context.files.readFile(`${ROOT}/.green-proof/vitest.red.config.mjs`)
    expect(vitestConfig).toBe(redVitestConfigText(['core/a.test.ts']))
  })

  it('adds a warning for each surviving mutant without failing the cycle', () => {
    const result = mutating({ stryker: { app: { report: strykerReport('Survived') } } }).run()
    expect(result.status).toBe('proven')
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'surviving-mutant',
        sha: GREEN,
        file: 'core/a.ts',
        line: 7,
      }),
    ])
  })

  it('runs no Stryker when no covered line is in a mutated folder', () => {
    const diff = diffOf([['editor/x.tsx', { start: 7, added: ['const x = 1'] }]])
    const test = mutating({
      greenFiles: ['editor/x.tsx'],
      diff,
      lcov: lcovOf([['editor/x.tsx', [[7, 1]]]]),
    })
    const result = test.run()
    expect(test.strykerCalls()).toEqual([])
    expect(result.timings).not.toHaveProperty('mutation')
  })

  it('runs no Stryker when the RED tests fail at GREEN', () => {
    const test = mutating({ green: report('fail') })
    test.run()
    expect(test.strykerCalls()).toEqual([])
  })

  it('warns with the exit status and last stderr line when Stryker fails', () => {
    const stryker = {
      app: { status: 2, stderr: 'warn\nboom\n\n', report: strykerReport('Survived') },
    }
    const result = mutating({ stryker }).run()
    expect(result.status).not.toBe('failed')
    expect(result.findings).toEqual([
      {
        rule: 'mutation-run-failed',
        sha: GREEN,
        message: 'Stryker exited 2 for the app group: boom',
      },
    ])
  })

  it.each([
    ['the last stdout line when stderr is blank', { stdout: 'a\nb\n', stderr: ' \n' }, 'b'],
    ['no output when both are empty', {}, 'no output'],
  ])('names %s in the Stryker failure', (_name, output, last) => {
    const result = mutating({ stryker: { app: { status: 1, ...output } } }).run()
    expect(result.findings.map((finding) => finding.message)).toEqual([
      `Stryker exited 1 for the app group: ${last}`,
    ])
  })

  it('warns when the Stryker report file is missing', () => {
    const result = mutating({ stryker: { app: { report: null } } }).run()
    expect(result.status).not.toBe('failed')
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'mutation-run-failed',
        sha: GREEN,
        message: expect.stringMatching(/^Stryker report for the app group is unreadable: .+/),
      }),
    ])
  })

  it('warns when the Stryker report is malformed', () => {
    const result = mutating({ stryker: { app: { report: 'not json' } } }).run()
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'mutation-run-failed',
        message: expect.stringMatching(
          /^Stryker report for the app group is unreadable: Stryker report: /,
        ),
      }),
    ])
  })

  it('removes the report file before each Stryker run so a stale report is never read', () => {
    const test = mutating({ stryker: { app: { report: null } } })
    test.context.files.writeFile(REPORT_FILE, strykerReport('Survived'))
    const result = test.run()
    expect(test.context.files.removedFiles).toContain(REPORT_FILE)
    expect(rules(result)).toEqual(['mutation-run-failed'])
  })

  it('runs the app group and then the tooling group with their own checkers', () => {
    const test = mutating({
      greenFiles: ['core/a.ts', 'scripts/x.mjs'],
      diff: SCRIPT_DIFF,
      lcov: BOTH_COVERED,
    })
    test.run()
    expect(test.strykerCalls().map((call) => call.args[3])).toEqual([
      '.green-proof/stryker-app.json',
      '.green-proof/stryker-tooling.json',
    ])
    expect(writtenJson(test, '.green-proof/stryker-app.json')).toMatchObject({
      mutate: ['core/a.ts:7-7'],
      checkers: ['typescript'],
    })
    expect(writtenJson(test, '.green-proof/stryker-tooling.json')).toMatchObject({
      mutate: ['scripts/x.mjs:3-3'],
      checkers: [],
    })
  })

  it('runs the tooling group even when the app group fails', () => {
    const test = mutating({
      greenFiles: ['core/a.ts', 'scripts/x.mjs'],
      diff: SCRIPT_DIFF,
      lcov: BOTH_COVERED,
      stryker: {
        app: { status: 1, stderr: 'crash' },
        tooling: { report: strykerReport('Survived', 'scripts/x.mjs', 3) },
      },
    })
    const result = test.run()
    expect(test.strykerCalls()).toHaveLength(2)
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'mutation-run-failed' }),
      expect.objectContaining({ rule: 'surviving-mutant', file: 'scripts/x.mjs', line: 3 }),
    ])
  })

  it('records the mutation time only when Stryker runs', () => {
    expect(typeof mutating().run().timings.mutation).toBe('number')
  })

  it('still mutates the covered lines when check 3 found an uncovered line', () => {
    const diff = diffOf([['core/a.ts', { start: 7, added: ['const x = 1', 'const y = 2'] }]])
    const test = mutating({
      diff,
      lcov: lcovOf([
        [
          'core/a.ts',
          [
            [7, 1],
            [8, 0],
          ],
        ],
      ]),
    })
    const result = test.run()
    expect(result.status).toBe('failed')
    expect(rules(result)).toContain('uncovered-added-line')
    expect(test.strykerCalls()).toHaveLength(1)
    expect(writtenJson(test, '.green-proof/stryker-app.json').mutate).toEqual(['core/a.ts:7-7'])
  })

  it('mutates once with only the unit tests of a mixed RED set', () => {
    const test = mutating({ reds: [['core/a.test.ts', 'e2e/tests/a.spec.ts']] })
    test.run()
    expect(test.strykerCalls()).toHaveLength(1)
    const text = test.context.files.readFile(RED_CONFIG)
    expect(text).toBe(redVitestConfigText(['core/a.test.ts']))
    expect(text).not.toContain('e2e/tests/a.spec.ts')
  })

  it('names the related unit tests, not the assets, when the RED set is assets only', () => {
    const test = mutating({ reds: [[FIXTURES]] })
    test.run()
    expect(test.strykerCalls()).toHaveLength(1)
    const text = test.context.files.readFile(RED_CONFIG)
    expect(text).toBe(redVitestConfigText(['core/a.test.ts']))
    expect(text).not.toContain(FIXTURES)
  })

  it('lets a thrown Stryker command propagate', () => {
    const test = mutating({ stryker: { app: { throws: 'spawn failed' } } })
    expect(() => test.run()).toThrow('spawn failed')
  })

  it('reads a finding file from an absolute report key as a repository path', () => {
    const stryker = { app: { report: strykerReport('Survived', `${ROOT}/core/a.ts`) } }
    const result = mutating({ stryker }).run()
    expect(result.findings).toEqual([expect.objectContaining({ file: 'core/a.ts', line: 7 })])
  })

  it('times the mutation check across every group, from the clock readings alone', () => {
    const strykerMs = 1000
    const test = mutating({
      greenFiles: ['core/a.ts', 'scripts/x.mjs'],
      diff: SCRIPT_DIFF,
      lcov: BOTH_COVERED,
      strykerMs,
    })
    const { mutation } = test.run().timings
    expect(mutation).toBeGreaterThanOrEqual(strykerMs * 2)
    expect(mutation).toBeLessThan(strykerMs * 2 + 100)
  })

  it('proves a GREEN commit with no provable added line without running Stryker', () => {
    const diff = diffOf([['docs/x.md', { start: 1, added: ['words'] }]])
    const test = mutating({ greenFiles: ['docs/x.md'], diff, lcov: undefined })
    const result = test.run()
    expect(test.strykerCalls()).toEqual([])
    expect(result.timings).not.toHaveProperty('mutation')
    expect(result.status).toBe('proven')
  })

  it('notes a cycle the budget did not reach and runs no Stryker', () => {
    const test = mutating()
    const budget = fakeBudget(false)
    test.context.budget = budget
    const result = test.run()
    expect(test.strykerCalls()).toEqual([])
    expect(() => test.context.files.readFile(`${ROOT}/.green-proof/stryker-app.json`)).toThrow()
    expect(() => test.context.files.readFile('/wt/.green-proof/vitest.red.config.mjs')).toThrow()
    expect(result.notes).toContain(MUTATION_NOT_REACHED_NOTE)
    expect(result.timings).not.toHaveProperty('mutation')
    expect(result.status).toBe('proven')
    expect(budget.calls).toEqual([['canStart']])
  })

  it('spends the time of every group of a started cycle', () => {
    const test = mutating({
      greenFiles: ['core/a.ts', 'scripts/x.mjs'],
      diff: SCRIPT_DIFF,
      lcov: BOTH_COVERED,
      strykerMs: 1000,
    })
    const budget = fakeBudget(true)
    test.context.budget = budget
    const result = test.run()
    expect(test.strykerCalls()).toHaveLength(2)
    expect(result.notes).toEqual([])
    expect(budget.calls).toEqual([['canStart'], ['spend', result.timings.mutation]])
  })

  it('does not ask the budget when the RED tests fail at GREEN', () => {
    const test = mutating({ green: report('fail') })
    const budget = fakeBudget(true)
    test.context.budget = budget
    const result = test.run()
    expect(budget.calls).toEqual([])
    expect(result.notes).not.toContain(MUTATION_NOT_REACHED_NOTE)
  })
})
