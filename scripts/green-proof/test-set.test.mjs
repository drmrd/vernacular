import { describe, expect, it } from 'vitest'
import { isUnitTestFile, redTestSet } from './test-set.mjs'

const always = () => true

function cycleOf(...fileLists) {
  return {
    green: { sha: 'g1', files: ['core/a.ts'] },
    reds: fileLists.map((files, index) => ({ sha: `r${index + 1}`, files })),
  }
}

describe('isUnitTestFile', () => {
  it('counts a test in tests/ or scripts/ as a unit test but not a browser, e2e, or story file', () => {
    const unit = ['core/a.test.ts', 'tests/architecture/x.test.ts', 'scripts/a/b.test.mjs']
    const other = ['storage/s.browser.test.ts', 'e2e/tests/a.spec.ts', 'editor/a.stories.tsx']
    expect(unit.map(isUnitTestFile)).toEqual([true, true, true])
    expect(other.map(isUnitTestFile)).toEqual([false, false, false])
  })

  it('counts a browser-named tsx test as a unit test because only .browser.test.ts is excluded', () => {
    expect(isUnitTestFile('editor/a.browser.test.tsx')).toBe(true)
    expect(isUnitTestFile('storage/s.browser.test.ts')).toBe(false)
  })
})

describe('redTestSet', () => {
  it('collects the unit test files of every RED commit once', () => {
    const set = redTestSet(
      cycleOf(['core/a.test.ts'], ['core/b.test.ts', 'core/a.test.ts']),
      always,
    )
    expect(set).toEqual({
      kind: 'unit',
      unitFiles: ['core/a.test.ts', 'core/b.test.ts'],
      otherFiles: [],
      assetFiles: [],
    })
  })

  it('leaves out a RED file that no longer exists at the GREEN commit', () => {
    const set = redTestSet(
      cycleOf(['core/old.test.ts'], ['core/a.test.ts']),
      (path) => path !== 'core/old.test.ts',
    )
    expect(set.unitFiles).toEqual(['core/a.test.ts'])
  })

  it('marks a set with unit and end-to-end tests as mixed', () => {
    const set = redTestSet(cycleOf(['core/a.test.ts', 'e2e/tests/a.spec.ts']), always)
    expect(set.kind).toBe('mixed')
    expect(set.unitFiles).toEqual(['core/a.test.ts'])
    expect(set.otherFiles).toEqual(['e2e/tests/a.spec.ts'])
  })

  it('marks a set of only end-to-end, browser, or story tests as other-only', () => {
    const set = redTestSet(
      cycleOf(['e2e/tests/a.spec.ts', 'storage/s.browser.test.ts', 'editor/a.stories.tsx']),
      always,
    )
    expect(set.kind).toBe('other-only')
    expect(set.unitFiles).toEqual([])
    expect(set.otherFiles).toEqual([
      'e2e/tests/a.spec.ts',
      'editor/a.stories.tsx',
      'storage/s.browser.test.ts',
    ])
  })

  it('marks a set of only fixtures and support files as assets-only', () => {
    const set = redTestSet(cycleOf(['core/x-test-fixtures.ts']), always)
    expect(set.kind).toBe('assets-only')
    expect(set.assetFiles).toEqual(['core/x-test-fixtures.ts'])
  })

  it('marks a set whose files are all gone as empty', () => {
    const set = redTestSet(cycleOf(['core/a.test.ts']), () => false)
    expect(set).toEqual({ kind: 'empty', unitFiles: [], otherFiles: [], assetFiles: [] })
  })

  it('keeps fixtures beside unit tests in a unit set', () => {
    const set = redTestSet(cycleOf(['core/a.test.ts', 'core/x-test-fixtures.ts']), always)
    expect(set.kind).toBe('unit')
    expect(set.unitFiles).toEqual(['core/a.test.ts'])
    expect(set.assetFiles).toEqual(['core/x-test-fixtures.ts'])
  })

  it('keeps fixtures beside end-to-end tests in an other-only set', () => {
    const set = redTestSet(cycleOf(['e2e/tests/a.spec.ts', 'core/x-test-fixtures.ts']), always)
    expect(set.kind).toBe('other-only')
  })

  it('marks a set with unit, end-to-end, and fixture files as mixed', () => {
    const set = redTestSet(
      cycleOf(['core/a.test.ts', 'e2e/tests/a.spec.ts', 'core/x-test-fixtures.ts']),
      always,
    )
    expect(set.kind).toBe('mixed')
  })

  it('counts only the new path of a RED test file renamed before the GREEN commit', () => {
    const set = redTestSet(
      cycleOf(['core/old.test.ts'], ['core/new.test.ts']),
      (path) => path === 'core/new.test.ts',
    )
    expect(set.unitFiles).toEqual(['core/new.test.ts'])
  })
})
