import { describe, expect, it, vi } from 'vitest'
import { emDashFindings } from './prose-rules.mjs'

const EM_DASH = '\u2014'

/** @param {string} file @param {number} line @param {string} text */
function added(file, line, text) {
  return { file, line, text }
}

/** @param {Record<string, string>} contents */
function readerFor(contents) {
  return vi.fn((path) => contents[path] ?? '')
}

describe('emDashFindings', () => {
  it('warns about an em-dash on an added Markdown line', () => {
    const text = `A short note ${EM_DASH} with a dash`
    const readFile = readerFor({ 'docs/notes.md': `# Notes\n${text}\n` })
    const findings = emDashFindings([added('docs/notes.md', 2, text)], readFile)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('em-dash')
    expect(findings[0].file).toBe('docs/notes.md')
    expect(findings[0].line).toBe(2)
  })

  it('ignores an added line inside a fenced block opened on an unchanged line', () => {
    const text = `value ${EM_DASH} other`
    const content = ['```', 'const a = 1', text, '```', ''].join('\n')
    const readFile = readerFor({ 'docs/guide.md': content })
    expect(emDashFindings([added('docs/guide.md', 3, text)], readFile)).toEqual([])
  })

  it('ignores an em-dash inside inline code and on tilde fences', () => {
    const inline = `Use the \`a ${EM_DASH} b\` form`
    const fenced = `x ${EM_DASH} y`
    const content = [inline, '~~~', fenced, '~~~', ''].join('\n')
    const readFile = readerFor({ 'docs/guide.md': content })
    const lines = [added('docs/guide.md', 1, inline), added('docs/guide.md', 3, fenced)]
    expect(emDashFindings(lines, readFile)).toEqual([])
  })

  it('ignores source files and the exempt canonical files', () => {
    const text = `a ${EM_DASH} b`
    const lines = [
      added('core/a.ts', 1, text),
      added('CHANGELOG.md', 1, text),
      added('LICENSE', 1, text),
    ]
    expect(emDashFindings(lines, readerFor({}))).toEqual([])
  })

  it('reads each prose file once and never reads a file with no added lines', () => {
    const text = `a ${EM_DASH} b`
    const readFile = readerFor({
      'docs/one.md': `${text}\n${text}\n`,
      'docs/two.txt': `${text}\n`,
    })
    const lines = [
      added('docs/one.md', 1, text),
      added('docs/one.md', 2, text),
      added('docs/two.txt', 1, text),
    ]
    const findings = emDashFindings(lines, readFile)
    expect(findings).toHaveLength(lines.length)
    expect(readFile).toHaveBeenCalledTimes(2)
    expect(readFile).toHaveBeenCalledWith('docs/one.md')
    expect(readFile).toHaveBeenCalledWith('docs/two.txt')
    expect(readFile).not.toHaveBeenCalledWith('docs/untouched.md')
  })
})
