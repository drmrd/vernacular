import { describe, expect, it } from 'vitest'
import {
  mutateRanges,
  mutationTargets,
  redVitestConfigText,
  strykerConfig,
  strykerGroups,
} from './mutation.mjs'

/** @param {string} file @param {number} line */
const added = (file, line) => ({ file, line, text: `line ${line}` })

const BASE = {
  testRunner: 'vitest',
  tempDirName: '.stryker-tmp',
  reporters: ['progress', 'clear-text', 'html'],
  vitest: { configFile: 'vitest.stryker.config.ts' },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.stryker.json',
  mutate: ['core/**/*.ts'],
  thresholds: { high: 80, low: 60, break: 50 },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
}

/** @param {'app'|'tooling'} group @param {string[]} [ranges] */
const request = (group, ranges = ['core/a.ts:7-8']) => ({
  group,
  ranges,
  vitestConfigFile: '.green-proof/vitest.red.config.mjs',
  reportFile: `.green-proof/mutation-${group}.json`,
})

describe('mutationTargets', () => {
  it('mutates only covered lines in core, storage, session, and scripts', () => {
    const lines = [
      added('core/a.ts', 1),
      added('editor/x.tsx', 2),
      added('storage/b.ts', 3),
      added('session/c.ts', 4),
      added('scripts/d.mjs', 5),
    ]
    expect(mutationTargets(lines)).toEqual([
      added('core/a.ts', 1),
      added('storage/b.ts', 3),
      added('session/c.ts', 4),
      added('scripts/d.mjs', 5),
    ])
  })

  it('matches the folder at the start of the path only', () => {
    const lines = [added('coreutils/x.ts', 1), added('editor/core/x.ts', 2)]
    expect(mutationTargets(lines)).toEqual([])
  })

  it('keeps the input order', () => {
    const lines = [added('session/z.ts', 9), added('core/a.ts', 1)]
    expect(mutationTargets(lines)).toEqual(lines)
  })
})

describe('mutateRanges', () => {
  it('merges consecutive added lines into one range per run', () => {
    const lines = [3, 4, 5, 9].map((n) => added('core/a.ts', n))
    expect(mutateRanges(lines)).toEqual(['core/a.ts:3-5', 'core/a.ts:9-9'])
  })

  it('sorts by file and then by line', () => {
    const lines = [added('core/b.ts', 2), added('core/a.ts', 8), added('core/a.ts', 1)]
    expect(mutateRanges(lines)).toEqual(['core/a.ts:1-1', 'core/a.ts:8-8', 'core/b.ts:2-2'])
  })

  it('keeps files already in order and sorts files given out of order', () => {
    const inOrder = [added('core/a.ts', 1), added('core/b.ts', 2)]
    const reversed = [added('core/b.ts', 2), added('core/a.ts', 1)]
    const expected = ['core/a.ts:1-1', 'core/b.ts:2-2']
    expect(mutateRanges(inOrder)).toEqual(expected)
    expect(mutateRanges(reversed)).toEqual(expected)
  })

  it('gives one range for a duplicated line', () => {
    const lines = [added('core/a.ts', 4), added('core/a.ts', 4)]
    expect(mutateRanges(lines)).toEqual(['core/a.ts:4-4'])
  })

  it('gives no range for no lines', () => {
    expect(mutateRanges([])).toEqual([])
  })
})

describe('strykerGroups', () => {
  it('splits ranges into the app group and the tooling group', () => {
    const ranges = ['scripts/d.mjs:1-2', 'core/a.ts:3-3', 'session/c.ts:4-5']
    expect(strykerGroups(ranges)).toEqual([
      { group: 'app', ranges: ['core/a.ts:3-3', 'session/c.ts:4-5'] },
      { group: 'tooling', ranges: ['scripts/d.mjs:1-2'] },
    ])
  })

  it('omits the tooling group when no range is a script', () => {
    expect(strykerGroups(['core/a.ts:3-3'])).toEqual([{ group: 'app', ranges: ['core/a.ts:3-3'] }])
  })

  it('omits the app group when every range is a script', () => {
    expect(strykerGroups(['scripts/d.mjs:1-2'])).toEqual([
      { group: 'tooling', ranges: ['scripts/d.mjs:1-2'] },
    ])
  })
})

describe('strykerConfig', () => {
  it('narrows mutate, tests, reporter, and the break threshold', () => {
    const config = strykerConfig(BASE, request('app'))
    expect(config).toEqual({
      ...BASE,
      mutate: ['core/a.ts:7-8'],
      vitest: { configFile: '.green-proof/vitest.red.config.mjs', related: false },
      reporters: ['json'],
      jsonReporter: { fileName: '.green-proof/mutation-app.json' },
      thresholds: { high: 80, low: 60, break: null },
      incremental: false,
      checkers: ['typescript'],
      tsconfigFile: 'tsconfig.stryker.json',
    })
  })

  it('does not change the base config', () => {
    const copy = structuredClone(BASE)
    strykerConfig(BASE, request('app'))
    expect(BASE).toEqual(copy)
  })

  it('uses no checker and no tsconfig for the tooling group', () => {
    const config = strykerConfig(BASE, request('tooling', ['scripts/d.mjs:1-2']))
    expect(config.checkers).toEqual([])
    expect(config).not.toHaveProperty('tsconfigFile')
    expect(config.mutate).toEqual(['scripts/d.mjs:1-2'])
  })
})

describe('redVitestConfigText', () => {
  it('writes a Vitest config that includes only the RED test files', () => {
    const text = redVitestConfigText(['core/a.test.ts'])
    expect(text).toContain('include: ["core/a.test.ts"]')
    expect(text).toContain("'../vite.config.ts'")
    expect(text).toContain("'vitest/config'")
    expect(text).toContain('mergeConfig')
  })

  it('writes the whole module, one statement per line', () => {
    expect(redVitestConfigText(['core/a.test.ts', 'scripts/b.test.mjs'])).toBe(
      [
        "import { mergeConfig } from 'vitest/config'",
        "import base from '../vite.config.ts'",
        '',
        'export default mergeConfig(base, {',
        '  test: {',
        '    include: ["core/a.test.ts","scripts/b.test.mjs"],',
        "    exclude: ['**/*.browser.test.ts'],",
        '  },',
        '})',
        '',
      ].join('\n'),
    )
  })

  it('excludes the browser tests', () => {
    expect(redVitestConfigText(['core/a.test.ts'])).toContain("'**/*.browser.test.ts'")
  })

  it('quotes a file name that holds a quote character', () => {
    const text = redVitestConfigText(['core/a"b.test.ts'])
    expect(text).toContain('include: ["core/a\\"b.test.ts"]')
  })

  it('includes no file for an empty list', () => {
    expect(redVitestConfigText([])).toContain('include: []')
  })
})
