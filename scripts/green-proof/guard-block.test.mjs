import { describe, expect, it, vi } from 'vitest'
import { guardBlockLines, splitGuardLines } from './guard-block.mjs'

const range = (from, to) => new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i))
const lines = (...text) => text.join('\n').concat('\n')

describe('guardBlockLines', () => {
  it('finds the block of a guard that names a const built from import.meta.url', () => {
    const source = lines(
      'const invokedPath = process.argv[1]',
      'const isDirectInvocation =',
      '  invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath',
      '',
      'if (isDirectInvocation) {',
      '  main()',
      '    .then((code) => {',
      '      process.exitCode = code',
      '    })',
      '    .catch(report)',
      '  finish()',
      '}',
      'after()',
    )
    expect(guardBlockLines(source)).toEqual(range(5, 12))
  })

  it('finds the block of a guard whose condition reads import.meta.url itself', () => {
    const source = lines(
      "import { fileURLToPath } from 'node:url'",
      '',
      'if (process.argv[1] === fileURLToPath(import.meta.url)) {',
      '  serve()',
      '  log()',
      '}',
    )
    expect(guardBlockLines(source)).toEqual(range(3, 6))
  })

  it('finds the block of a guard whose const initializer spans two lines and uses pathToFileURL', () => {
    const source = lines(
      'const invokedDirectly =',
      '  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href',
      '',
      'if (invokedDirectly) {',
      '  run(',
      '    (code) => {',
      '      exit(code)',
      '    },',
      '  )',
      '}',
    )
    expect(guardBlockLines(source)).toEqual(range(4, 10))
  })

  it('ignores a top-level if that does not test how the script was started', () => {
    const source = lines(
      'const root = fileURLToPath(new URL(".", import.meta.url))',
      '',
      "if (process.argv.includes('--check')) {",
      '  check(root)',
      '}',
    )
    expect(guardBlockLines(source)).toEqual(new Set())
  })

  it('gives no block for an indented guard, a brace-less guard, or a guard with no closing brace at column 0', () => {
    const indented = lines(
      'function f() {',
      '  if (import.meta.url === x) {',
      '    go()',
      '  }',
      '}',
    )
    const braceless = lines(
      'const isDirectInvocation = import.meta.url === process.argv[1]',
      'if (isDirectInvocation) run()',
    )
    const unclosed = lines('if (import.meta.url === x) {', '  go()', '  stop()')
    expect(guardBlockLines(indented)).toEqual(new Set())
    expect(guardBlockLines(braceless)).toEqual(new Set())
    expect(guardBlockLines(unclosed)).toEqual(new Set())
  })

  it('leaves the lines just before the if and just after its closing brace outside the block', () => {
    const source = lines(
      'export function spawnIt() {',
      '  return spawn()',
      '}',
      'if (import.meta.url === process.argv[1]) {',
      '  go()',
      '}',
      'trailing()',
    )
    const block = guardBlockLines(source)
    expect(block).toEqual(range(4, 6))
    expect(block.has(3)).toBe(false)
    expect(block.has(7)).toBe(false)
  })
})

describe('splitGuardLines', () => {
  it('splits lines into guard and other lines and reads each file once', () => {
    const source = lines(
      'export const a = 1',
      'if (import.meta.url === process.argv[1]) {',
      '  go()',
      '}',
    )
    const readSource = vi.fn((file) => (file === 'scripts/x.mjs' ? source : 'export const a = 1\n'))
    const at = (file, line) => ({ file, line, text: 'x' })
    const input = [at('scripts/x.mjs', 1), at('core/a.ts', 1), at('scripts/x.mjs', 3)]
    const { guard, other } = splitGuardLines(input, readSource)
    expect(guard).toEqual([at('scripts/x.mjs', 3)])
    expect(other).toEqual([at('scripts/x.mjs', 1), at('core/a.ts', 1)])
    expect(readSource).toHaveBeenCalledTimes(2)
  })
})
