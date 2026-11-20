import { describe, expect, it } from 'vitest'
import { exemptTestFiles } from './scope-rules.mjs'

/** One file section of `git show -M --unified=0`: a content change. */
function modifiedSection(path, changedLines) {
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1 +1 @@',
    ...changedLines,
    '',
  ].join('\n')
}

const COMMENT_CHANGE = ['-// the total of one line', '+// the total of two lines']
const BLOCK_COMMENT_CHANGE = ['-/**', '- * Old wording.', '- */', '+/*', '+ * New wording.', '+ */']
const IMPORT_PATH_CHANGE = [
  "-import { total } from './old-path'",
  "+import { total } from './new-path'",
]
const ASSERTION_CHANGE = ['-expect(total()).toBe(1)', '+expect(total()).toBe(2)']

describe('exemptTestFiles comment-only changes', () => {
  it('exempts a test file whose every changed line is a line comment', () => {
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', COMMENT_CHANGE))
    expect(exempt.has('core/a.test.ts')).toBe(true)
  })

  it('exempts a test file whose every changed line is part of a block comment', () => {
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', BLOCK_COMMENT_CHANGE))
    expect(exempt.has('core/a.test.ts')).toBe(true)
  })

  it('exempts a test file that mixes comment lines with import lines', () => {
    const changed = [...COMMENT_CHANGE, ...IMPORT_PATH_CHANGE]
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', changed))
    expect(exempt.has('core/a.test.ts')).toBe(true)
  })

  it('does not exempt a test file that mixes a comment change with an assertion change', () => {
    const changed = [...COMMENT_CHANGE, ...ASSERTION_CHANGE]
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', changed))
    expect(exempt.has('core/a.test.ts')).toBe(false)
  })

  it('exempts a block comment that opens and closes on one line', () => {
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', ['-/* old */', '+/* new */']))
    expect(exempt.has('core/a.test.ts')).toBe(true)
  })

  it('exempts block comment lines without a star prefix', () => {
    const changed = ['-/*', '-old wording', '-*/', '+/*', '+new wording', '+*/']
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', changed))
    expect(exempt.has('core/a.test.ts')).toBe(true)
  })

  it.each([
    [
      'code after a one-line block comment',
      ['-/* c */ expect(x).toBe(1)', '+/* c */ expect(x).toBe(2)'],
    ],
    [
      'code after a closing star-slash with no open block',
      ['-*/ expect(x).toBe(1)', '+*/ expect(x).toBe(2)'],
    ],
    ['a generator method', ['-*entries() { yield 1 }', '+*entries() { yield 2 }']],
    ['a lone star line with no open block comment', ['-* old bullet', '+* new bullet']],
    [
      'a vitest environment directive',
      ['-// @vitest-environment node', '+// @vitest-environment jsdom'],
    ],
    ['an eslint directive', ['-// eslint-disable-next-line a', '+// eslint-disable-next-line b']],
    ['a ts directive', ['-// @ts-expect-error old', '+// @ts-expect-error new']],
    ['a prettier directive', ['-// prettier-ignore', '+// prettier-ignore-start']],
  ])('does not exempt %s', (_name, changed) => {
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', changed))
    expect(exempt.has('core/a.test.ts')).toBe(false)
  })

  it('does not exempt code that follows a closing star-slash inside an open block', () => {
    const changed = [
      '-/*',
      '- * old',
      '-*/ expect(x).toBe(1)',
      '+/*',
      '+ * new',
      '+*/ expect(x).toBe(2)',
    ]
    const exempt = exemptTestFiles(modifiedSection('core/a.test.ts', changed))
    expect(exempt.has('core/a.test.ts')).toBe(false)
  })

  it('judges each file section on its own', () => {
    const diff =
      modifiedSection('core/a.test.ts', COMMENT_CHANGE) +
      modifiedSection('core/b.test.ts', [...COMMENT_CHANGE, ...ASSERTION_CHANGE])
    const exempt = exemptTestFiles(diff)
    expect([...exempt]).toEqual(['core/a.test.ts'])
  })
})
