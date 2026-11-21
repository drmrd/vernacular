import { describe, expect, it } from 'vitest'
import { GREEN, LCOV_FILE, diffOf, lcovOf, report, scenario } from './green-proof-test-support.mjs'

const SHOW_ARGS = [
  '-c',
  'core.quotePath=false',
  'show',
  '--format=',
  '--unified=0',
  '--no-color',
  '--no-ext-diff',
  '-M',
  GREEN,
]
const ADDED = diffOf([['core/a.ts', { start: 7, added: ['const x = 1'] }]])
const UNCOVERED = lcovOf([['core/a.ts', [[7, 0]]]])
const isCoverageArg = (arg) => arg.startsWith('--coverage')
const FIXTURES = 'core/x-test-fixtures.ts'

/** A scenario whose RED test fails at the parent and passes at GREEN. */
const proving = (setup) => scenario({ parent: report('fail'), green: report('pass'), ...setup })

describe('proveCycle diff coverage', () => {
  it('fails an added executable line that the RED tests never run', () => {
    const test = proving({ diff: ADDED, lcov: UNCOVERED })
    const result = test.run()
    expect(test.context.runGit.calls).toContainEqual(SHOW_ARGS)
    expect(result.status).toBe('failed')
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'uncovered-added-line',
        sha: GREEN,
        file: 'core/a.ts',
        line: 7,
      }),
    ])
  })

  it('passes added lines with no coverage entry and lines moved from another file', () => {
    const diff = diffOf([
      ['core/a.ts', { start: 7, added: ['// a comment', 'const moved = 2'] }],
      ['core/b.ts', { start: 3, removed: ['const moved = 2'] }],
    ])
    const lcov = lcovOf([['core/a.ts', [[8, 0]]]])
    const result = proving({ diff, lcov }).run()
    expect(result).toMatchObject({ status: 'proven', findings: [] })
  })

  it('collects coverage only for the changed source files', () => {
    const test = proving({
      greenFiles: ['core/a.ts', 'docs/x.md'],
      diff: ADDED,
      lcov: lcovOf([['core/a.ts', [[7, 1]]]]),
    })
    test.run()
    const green = test.vitestCalls()[1].args
    expect(green).toContain('--coverage.include=core/a.ts')
    expect(green).not.toContain('--coverage.include=docs/x.md')
    expect(green).toContain('--coverage.reportsDirectory=.green-proof/coverage')
  })

  it('notes a changed file with no coverage record instead of failing it', () => {
    const result = proving({ diff: ADDED, lcov: lcovOf([['core/other.ts', [[1, 1]]]]) }).run()
    expect(result.status).not.toBe('failed')
    expect(result.findings).toEqual([])
    expect(result.notes).toContain('no coverage record (excluded from coverage): core/a.ts')
  })

  it('reports uncovered lines as warnings for a mixed set', () => {
    const reds = [['core/a.test.ts', 'e2e/tests/a.spec.ts']]
    const result = proving({ reds, diff: ADDED, lcov: UNCOVERED }).run()
    expect(result.status).not.toBe('failed')
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'mixed-uncovered-added-line', file: 'core/a.ts', line: 7 }),
    ])
  })

  it('reads no coverage when the RED tests still fail at GREEN', () => {
    const test = scenario({
      parent: report('fail'),
      green: report('fail'),
      diff: ADDED,
      lcov: UNCOVERED,
    })
    const result = test.run()
    expect(result.findings.map((finding) => finding.rule)).toEqual(['red-fails-at-green'])
  })

  it('stops with an error when the coverage run writes no lcov file', () => {
    const test = proving({ diff: ADDED })
    expect(() => test.run()).toThrow(/wrote no lcov file/)
  })

  it('stops with an error when the coverage run writes an lcov file with no records', () => {
    const test = proving({ diff: ADDED, lcov: '' })
    expect(() => test.run()).toThrow()
  })

  it('never reads a stale lcov left by an earlier run', () => {
    const test = proving({ diff: ADDED })
    test.context.files.writeFile(LCOV_FILE, lcovOf([['core/a.ts', [[7, 1]]]]))
    expect(() => test.run()).toThrow(/wrote no lcov file/)
  })

  it('asks for no coverage at the parent or when GREEN changes no proof source', () => {
    const withSource = proving({ diff: ADDED, lcov: lcovOf([['core/a.ts', [[7, 1]]]]) })
    withSource.run()
    expect(withSource.vitestCalls()[0].args.some(isCoverageArg)).toBe(false)
    const docsDiff = diffOf([['docs/x.md', { start: 1, added: ['some text'] }]])
    const docsOnly = proving({ greenFiles: ['docs/x.md'], diff: docsDiff })
    docsOnly.run()
    const allArgs = docsOnly.vitestCalls().flatMap((call) => call.args)
    expect(allArgs.some(isCoverageArg)).toBe(false)
  })

  it('collects coverage for a changed source whose path is not ASCII', () => {
    const path = 'core/café.ts'
    const diff = diffOf([[path, { start: 7, added: ['const x = 1'] }]])
    const test = proving({
      greenFiles: ['"core/caf\\303\\251.ts"'],
      diff,
      lcov: lcovOf([[path, [[7, 1]]]]),
    })
    test.run()
    expect(test.vitestCalls()[1].args).toContain(`--coverage.include=${path}`)
  })
})

describe('proveCycle with assets-only RED commits', () => {
  it('runs the tests related to changed test assets when the RED commits changed no test file', () => {
    const test = proving({ reds: [[FIXTURES]], lcov: lcovOf([['core/a.ts', [[7, 1]]]]) })
    const result = test.run()
    const [related, ...rest] = test.vitestCalls().map((call) => call.args)
    expect(related).toEqual(expect.arrayContaining(['related', FIXTURES]))
    expect(rest.at(-1)).toContain('core/a.test.ts')
    expect(result).toMatchObject({ status: 'proven', findings: [] })
  })

  it('flags assets-only RED commits whose related tests already pass at the parent', () => {
    const test = scenario({ reds: [[FIXTURES]], parent: report('pass'), green: report('pass') })
    const result = test.run()
    expect(result.findings.map((finding) => finding.rule)).toContain('red-passes-before-green')
  })

  it('skips the cycle when no unit test imports the changed assets', () => {
    const test = scenario({ reds: [[FIXTURES]], parent: report('empty'), green: report('pass') })
    const result = test.run()
    expect(result).toMatchObject({
      status: 'skipped',
      reason: `no unit test imports the RED test assets: ${FIXTURES}`,
      findings: [],
    })
    expect(test.vitestCalls()).toHaveLength(1)
  })

  describe('in a direct-invocation block', () => {
    const GUARDED = [
      'export const a = 1',
      'export const b = 2',
      'export function wrap() {',
      '  return 1',
      '}',
      'const c = 3',
      'const d = 4',
      'const e = 5',
      'const f = 6',
      'if (process.argv[1] === fileURLToPath(import.meta.url)) {',
      '  run()',
      '  done()',
      '  stop()',
      '}',
      '',
    ].join('\n')
    const sources = { 'scripts/x.mjs': GUARDED }
    const guarded = (added, hits) =>
      proving({
        greenFiles: ['scripts/x.mjs'],
        sources,
        diff: diffOf(added.map((line) => ['scripts/x.mjs', { start: line, added: ['x'] }])),
        lcov: lcovOf([['scripts/x.mjs', hits]]),
      })

    it('warns on an uncovered line inside the direct-invocation block and keeps the cycle proven', () => {
      const result = guarded([11], [[11, 0]]).run()
      expect(result.status).toBe('proven')
      expect(result.findings).toEqual([
        expect.objectContaining({ rule: 'uncovered-guard-line', file: 'scripts/x.mjs', line: 11 }),
      ])
    })

    it('still fails an uncovered line of a process wrapper outside the block', () => {
      const result = guarded(
        [4, 11],
        [
          [4, 0],
          [11, 0],
        ],
      ).run()
      expect(result.status).toBe('failed')
      expect(result.findings).toEqual([
        expect.objectContaining({ rule: 'uncovered-added-line', line: 4 }),
        expect.objectContaining({ rule: 'uncovered-guard-line', line: 11 }),
      ])
    })

    it('fails an uncovered line in a file with no direct-invocation block', () => {
      const result = proving({ diff: ADDED, lcov: UNCOVERED }).run()
      expect(result.status).toBe('failed')
    })
  })
})
