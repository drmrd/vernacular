import { describe, expect, it } from 'vitest'
import { formatPlainLine } from './report.mjs'

const SHA = '0123456789abcdef0123456789abcdef01234567'

describe('formatPlainLine', () => {
  it('puts the file and line before the message', () => {
    const finding = { rule: 'em-dash', message: 'm', file: 'docs/a.md', line: 3 }
    expect(formatPlainLine(finding, 'warn')).toBe('  [warn] [em-dash] docs/a.md:3: m')
  })

  it('names only the file when there is no line', () => {
    const finding = { rule: 'exact-pin', message: 'm', file: 'package.json' }
    expect(formatPlainLine(finding, 'fail')).toBe('  [fail] [exact-pin] package.json: m')
  })

  it('names the first eight characters of the sha when there is no file', () => {
    const finding = { rule: 'author-identity', message: 'm', sha: SHA }
    expect(formatPlainLine(finding, 'fail')).toBe('  [fail] [author-identity] 01234567: m')
  })

  it('names no location when the finding has neither a file nor a sha', () => {
    const finding = { rule: 'branch-prefix', message: 'm' }
    expect(formatPlainLine(finding, 'fail')).toBe('  [fail] [branch-prefix] m')
  })

  it('prefers the file over the sha when both are present', () => {
    const finding = { rule: 'em-dash', message: 'm', file: 'docs/a.md', line: 3, sha: SHA }
    expect(formatPlainLine(finding, 'warn')).toBe('  [warn] [em-dash] docs/a.md:3: m')
  })
})
