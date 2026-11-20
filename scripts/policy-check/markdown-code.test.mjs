import { describe, expect, it } from 'vitest'
import { fencedLineNumbers, withoutInlineCode } from './markdown-code.mjs'

const EM_DASH = '\u2014'

describe('fencedLineNumbers', () => {
  it('counts the opening and closing fence lines and the lines between as fenced', () => {
    const fenced = fencedLineNumbers(['a', '```', 'b', '```', 'c'].join('\n'))
    expect([...fenced].sort()).toEqual([2, 3, 4])
  })

  it('is not closed by a shorter fence or by a fence of the other character', () => {
    const content = ['````', 'a', '```', 'b', '~~~', 'c', '````', 'd'].join('\n')
    expect([...fencedLineNumbers(content)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('runs to the end of the content when a fence is never closed', () => {
    expect([...fencedLineNumbers(['x', '```', 'a', 'b'].join('\n'))].sort()).toEqual([2, 3, 4])
  })

  it('does not open a fence on a line indented four spaces', () => {
    expect(fencedLineNumbers(['    ```', 'a'].join('\n')).size).toBe(0)
  })

  it('does not open a fence on a backtick line whose info string holds a backtick', () => {
    expect(fencedLineNumbers('```a``` text\nb\nc').has(2)).toBe(false)
  })
})

describe('withoutInlineCode', () => {
  it('removes a double-backtick span that encloses a single backtick', () => {
    const text = 'x ``a ' + EM_DASH + ' ` b`` y'
    expect(withoutInlineCode(text)).not.toContain(EM_DASH)
  })

  it('keeps text that follows an unmatched backtick', () => {
    const text = 'odd ` tick ' + EM_DASH + ' more'
    expect(withoutInlineCode(text)).toContain(EM_DASH)
  })
})
