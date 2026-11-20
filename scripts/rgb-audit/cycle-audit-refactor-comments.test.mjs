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

  it('judges each file section on its own', () => {
    const diff =
      modifiedSection('core/a.test.ts', COMMENT_CHANGE) +
      modifiedSection('core/b.test.ts', [...COMMENT_CHANGE, ...ASSERTION_CHANGE])
    const exempt = exemptTestFiles(diff)
    expect([...exempt]).toEqual(['core/a.test.ts'])
  })
})
