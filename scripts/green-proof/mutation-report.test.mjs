import { describe, expect, it } from 'vitest'
import { survivorFindings } from './mutation-report.mjs'

const SHA = 'abc1234'
const ROOT = '/work/repo'
const CONTEXT = { sha: SHA, root: ROOT }

/** @param {number} line */
const location = (line) => ({
  start: { line, column: 3 },
  end: { line, column: 20 },
})

/**
 * @param {string} status
 * @param {number} line
 * @param {{ id?: string, mutatorName?: string, replacement?: string }} [extra]
 */
const mutant = (status, line, extra = {}) => ({
  id: extra.id ?? `m${line}`,
  mutatorName: extra.mutatorName ?? 'ConditionalExpression',
  replacement: extra.replacement ?? 'true',
  status,
  location: location(line),
})

/** @param {Record<string, unknown[]>} byFile */
const report = (byFile) =>
  JSON.stringify({
    files: Object.fromEntries(Object.entries(byFile).map(([path, mutants]) => [path, { mutants }])),
  })

/** @param {string} file @param {number} line @param {string} [text] */
const finding = (
  file,
  line,
  text = 'ConditionalExpression mutant survives the RED tests: true',
) => ({
  rule: 'surviving-mutant',
  sha: SHA,
  file,
  line,
  message: text,
})

describe('survivorFindings', () => {
  it('reports a surviving mutant on its line', () => {
    const text = report({ 'core/a.ts': [mutant('Survived', 12)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([finding('core/a.ts', 12)])
  })

  it('ignores every mutant status other than Survived and NoCoverage', () => {
    const statuses = ['Killed', 'Timeout', 'CompileError', 'RuntimeError', 'Ignored', 'Pending']
    const text = report({
      'core/a.ts': statuses.map((status, index) => mutant(status, index + 1)),
    })

    expect(survivorFindings(text, CONTEXT)).toEqual([])
  })

  it('reports a surviving mutant on line 1', () => {
    const text = report({ 'core/a.ts': [mutant('Survived', 1)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([finding('core/a.ts', 1)])
  })

  it('gives nothing for a status it does not know, even an inherited or coerced one', () => {
    const statuses = ['constructor', 'toString', '__proto__', 'hasOwnProperty', ['Survived']]
    const text = report({
      'core/a.ts': statuses.map((status, index) => mutant(status, index + 1)),
    })

    expect(survivorFindings(text, CONTEXT)).toEqual([])
  })

  it('maps an absolute report path to the repository path', () => {
    const text = report({ [`${ROOT}/core/a.ts`]: [mutant('Survived', 5)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([finding('core/a.ts', 5)])
  })

  it('maps an absolute path when the root has a trailing slash', () => {
    const text = report({ [`${ROOT}/core/a.ts`]: [mutant('Survived', 5)] })

    expect(survivorFindings(text, { sha: SHA, root: `${ROOT}/` })).toEqual([
      finding('core/a.ts', 5),
    ])
  })

  it('keeps an absolute path outside the root as it is', () => {
    const text = report({ '/elsewhere/core/a.ts': [mutant('Survived', 5)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([finding('/elsewhere/core/a.ts', 5)])
  })

  it('keeps a relative path as it is', () => {
    const text = report({ 'storage/b.ts': [mutant('Survived', 9)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([finding('storage/b.ts', 9)])
  })

  it('keeps file order, then mutant order', () => {
    const text = report({
      'core/a.ts': [mutant('Survived', 30), mutant('Killed', 31), mutant('Survived', 10)],
      'session/c.ts': [
        mutant('Survived', 2, { mutatorName: 'EqualityOperator', replacement: 'a !== b' }),
      ],
    })

    expect(survivorFindings(text, CONTEXT)).toEqual([
      finding('core/a.ts', 30),
      finding('core/a.ts', 10),
      finding('session/c.ts', 2, 'EqualityOperator mutant survives the RED tests: a !== b'),
    ])
  })

  it('reports a NoCoverage mutant as a test gap on its line', () => {
    const text = report({ 'core/a.ts': [mutant('NoCoverage', 7)] })

    expect(survivorFindings(text, CONTEXT)).toEqual([
      finding('core/a.ts', 7, 'ConditionalExpression mutant runs no RED test: true'),
    ])
  })

  it('ends a Survived message after the RED tests when there is no replacement', () => {
    const bare = { ...mutant('Survived', 3), replacement: undefined }
    const text = report({ 'core/a.ts': [bare] })

    expect(survivorFindings(text, CONTEXT)).toEqual([
      finding('core/a.ts', 3, 'ConditionalExpression mutant survives the RED tests'),
    ])
  })

  it('ends a NoCoverage message after the RED test when there is no replacement', () => {
    const bare = { ...mutant('NoCoverage', 3), replacement: undefined }
    const text = report({ 'core/a.ts': [bare] })

    expect(survivorFindings(text, CONTEXT)).toEqual([
      finding('core/a.ts', 3, 'ConditionalExpression mutant runs no RED test'),
    ])
  })

  describe('a malformed report', () => {
    /** @param {string} text */
    const rejects = (text) => {
      let thrown
      try {
        survivorFindings(text, CONTEXT)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      expect(thrown.message).toMatch(/^Stryker report: /)
    }

    /** @param {unknown} entry */
    const withFile = (entry) => JSON.stringify({ files: { 'core/a.ts': entry } })

    it('throws when the text is not JSON', () => {
      rejects('Stryker crashed')
    })

    it('throws when the JSON is not an object', () => {
      rejects('[1, 2]')
      rejects('null')
      rejects('42')
    })

    it('throws when the object has no files object', () => {
      rejects('{}')
      rejects('{"files": 3}')
      rejects('{"files": []}')
    })

    it('throws when a file entry has no mutants array', () => {
      rejects(withFile({ language: 'typescript' }))
      rejects(withFile({ mutants: {} }))
    })

    it('throws when a mutant is not an object', () => {
      rejects(withFile({ mutants: [null] }))
    })

    it('throws when a reported mutant has no positive integer start line', () => {
      const withLine = (start) =>
        withFile({ mutants: [{ ...mutant('Survived', 1), location: { start } }] })

      rejects(withFile({ mutants: [{ ...mutant('Survived', 1), location: undefined }] }))
      rejects(withLine({ column: 3 }))
      rejects(withLine({ line: '12' }))
      rejects(withLine({ line: 0 }))
      rejects(withLine({ line: 1.5 }))
    })

    it('throws when a reported mutant has a location without a start', () => {
      rejects(withFile({ mutants: [{ ...mutant('Survived', 1), location: {} }] }))
    })
  })
})
