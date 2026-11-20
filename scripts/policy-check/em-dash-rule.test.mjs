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

  it('reads each prose file once', () => {
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
  })

  it('does not repeat the file path in the finding message', () => {
    const text = `A note ${EM_DASH} here`
    const readFile = readerFor({ 'docs/notes.md': `${text}\n` })
    const [finding] = emDashFindings([added('docs/notes.md', 1, text)], readFile)
    expect(finding.message).not.toContain('docs/notes.md')
  })

  it('keeps a fence open until a closing fence of the same character and enough length', () => {
    const text = `x ${EM_DASH} y`
    const content = [
      '````',
      text,
      '```',
      text,
      '````',
      text,
      '```',
      text,
      '~~~',
      text,
      '```',
      text,
      '',
    ].join('\n')
    const readFile = readerFor({ 'docs/guide.md': content })
    const findings = emDashFindings(
      [2, 4, 6, 8, 10, 12].map((line) => added('docs/guide.md', line, text)),
      readFile,
    )
    expect(findings.map((finding) => finding.line)).toEqual([6, 12])
  })

  it('treats the rest of the file as code when a fence is never closed', () => {
    const text = `x ${EM_DASH} y`
    const readFile = readerFor({ 'docs/guide.md': ['```', 'code', text, ''].join('\n') })
    expect(emDashFindings([added('docs/guide.md', 3, text)], readFile)).toEqual([])
  })

  it('does not treat a fence indented four spaces as a fence', () => {
    const text = `x ${EM_DASH} y`
    const readFile = readerFor({ 'docs/guide.md': ['    ```', text, ''].join('\n') })
    expect(emDashFindings([added('docs/guide.md', 2, text)], readFile)).toHaveLength(1)
  })

  it('ignores an em-dash inside a double-backtick span that encloses a single backtick', () => {
    const text = `Use ${'``'}a ${EM_DASH} ` + '`' + ` b${'``'} here`
    const readFile = readerFor({ 'docs/guide.md': `${text}\n` })
    expect(emDashFindings([added('docs/guide.md', 1, text)], readFile)).toEqual([])
  })

  it('still warns about an em-dash that follows an unmatched backtick', () => {
    const text = 'An odd ` tick ' + `${EM_DASH} then more`
    const readFile = readerFor({ 'docs/guide.md': `${text}\n` })
    expect(emDashFindings([added('docs/guide.md', 1, text)], readFile)).toHaveLength(1)
  })

  it('treats an em-dash on an opening fence line as code', () => {
    const text = '```text ' + `${EM_DASH} note`
    const readFile = readerFor({ 'docs/guide.md': [text, 'body', '```', ''].join('\n') })
    expect(emDashFindings([added('docs/guide.md', 1, text)], readFile)).toEqual([])
  })

  it('exempts a nested canonical file by its name and checks .mdx files', () => {
    const text = `a ${EM_DASH} b`
    const readFile = readerFor({ 'docs/page.mdx': `${text}\n` })
    const lines = [
      added('public/packs/x/CHANGELOG.md', 1, text),
      added('core/a.ts', 1, text),
      added('docs/page.mdx', 1, text),
    ]
    const findings = emDashFindings(lines, readFile)
    expect(findings.map((finding) => finding.file)).toEqual(['docs/page.mdx'])
    expect(readFile).not.toHaveBeenCalledWith('core/a.ts')
  })

  it('warns on a later line when a backtick line with a backtick in its info string precedes it', () => {
    const text = `x ${EM_DASH} y`
    const readFile = readerFor({ 'docs/guide.md': ['```a``` text', text, ''].join('\n') })
    expect(emDashFindings([added('docs/guide.md', 2, text)], readFile)).toHaveLength(1)
  })
})
