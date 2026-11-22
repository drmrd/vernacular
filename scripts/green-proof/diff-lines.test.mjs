import { describe, expect, it } from 'vitest'
import { isProofSource, parseRemovedLines, provableAddedLines } from './diff-lines.mjs'

const added = (file, line, text) => ({ file, line, text })

describe('parseRemovedLines', () => {
  it('reads removed lines from hunks but not file headers', () => {
    const raw = [
      'diff --git a/core/a.ts b/core/a.ts',
      'index 1111111..2222222 100644',
      '--- a/core/a.ts',
      '+++ b/core/a.ts',
      '@@ -3,2 +3,1 @@ export function a() {',
      '-const x = 1',
      '-  return x',
      '+const y = 2',
      'diff --git a/core/b.ts b/core/b.ts',
      'index 3333333..4444444 100644',
      '--- a/core/b.ts',
      '+++ b/core/b.ts',
      '@@ -8 +8,0 @@',
      '---y',
      '',
    ].join('\n')
    expect(parseRemovedLines(raw)).toEqual(['const x = 1', '  return x', '--y'])
  })

  it('does not return a no-newline marker line', () => {
    const raw = [
      'diff --git a/core/a.ts b/core/a.ts',
      'index 1111111..2222222 100644',
      '--- a/core/a.ts',
      '+++ b/core/a.ts',
      '@@ -4 +4 @@',
      '-const x = 1',
      '\\ No newline at end of file',
      '+const x = 2',
      '',
    ].join('\n')
    expect(parseRemovedLines(raw)).toEqual(['const x = 1'])
  })

  it('returns nothing for a new file that only adds lines', () => {
    const raw = [
      'diff --git a/core/new.ts b/core/new.ts',
      'new file mode 100644',
      'index 0000000..2222222',
      '--- /dev/null',
      '+++ b/core/new.ts',
      '@@ -0,0 +1,2 @@',
      '+export const a = 1',
      '+export const b = 2',
      '',
    ].join('\n')
    expect(parseRemovedLines(raw)).toEqual([])
  })

  it('returns every line of a deleted file', () => {
    const raw = [
      'diff --git a/core/old.ts b/core/old.ts',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/core/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const a = 1',
      '-export const b = 2',
      '',
    ].join('\n')
    expect(parseRemovedLines(raw)).toEqual(['export const a = 1', 'export const b = 2'])
  })

  it('ignores removed lines of test support files and docs but keeps those of production source', () => {
    const raw = [
      'diff --git a/core/a-test-support.ts b/core/a-test-support.ts',
      'index 1111111..2222222 100644',
      '--- a/core/a-test-support.ts',
      '+++ b/core/a-test-support.ts',
      '@@ -1 +1 @@',
      '-const helper = 1',
      '+const helper = 2',
      'diff --git a/docs/a.md b/docs/a.md',
      'index 3333333..4444444 100644',
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -1 +1 @@',
      '-old prose',
      '+new prose',
      'diff --git a/core/a.ts b/core/a.ts',
      'index 5555555..6666666 100644',
      '--- a/core/a.ts',
      '+++ b/core/a.ts',
      '@@ -1 +1 @@',
      '-const kept = 1',
      '+const kept = 2',
      '',
    ].join('\n')
    expect(parseRemovedLines(raw)).toEqual(['const kept = 1'])
  })
})

describe('provableAddedLines', () => {
  it('exempts an added line that matches a removed line in another file, ignoring indentation', () => {
    expect(
      provableAddedLines([added('core/b.ts', 4, '    return total')], ['  return total']),
    ).toEqual([])
  })

  it('lets each removed line exempt only one added line', () => {
    const lines = [added('core/a.ts', 1, 'count += 1'), added('core/a.ts', 2, 'count += 1')]
    expect(provableAddedLines(lines, ['count += 1'])).toEqual([added('core/a.ts', 2, 'count += 1')])
  })

  it('keeps added lines whose text no removed line matches', () => {
    const lines = [added('core/a.ts', 1, 'const a = 1'), added('core/a.ts', 2, 'const b = 2')]
    expect(provableAddedLines(lines, ['const c = 3'])).toEqual(lines)
  })
})

describe('isProofSource', () => {
  it('excludes unit tests, stories, and end-to-end files', () => {
    const no = ['core/a.test.ts', 'editor/a.stories.tsx', 'e2e/a.ts']
    expect(no.map(isProofSource)).toEqual([false, false, false])
  })

  it('treats only JavaScript and TypeScript source as proof source', () => {
    const yes = ['core/a.ts', 'editor/a.tsx', 'scripts/x.mjs', 'src/a.js']
    const no = ['core/a.d.ts', 'docs/a.md', 'core/a-test-fixtures.ts', 'package.json']
    expect(yes.map(isProofSource)).toEqual([true, true, true, true])
    expect(no.map(isProofSource)).toEqual([false, false, false, false])
  })

  it('excludes the generated schema validators but keeps hand-written format source', () => {
    const generated = [
      'core/format/generated/current-schema-validator.js',
      'core/format/generated/tolerant-schema-validator.js',
    ]
    expect(generated.map(isProofSource)).toEqual([false, false])
    expect(isProofSource('core/format/schema-version.ts')).toBe(true)
  })
})
