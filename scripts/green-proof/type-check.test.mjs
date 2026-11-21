import { describe, expect, it } from 'vitest'
import {
  declarationFiles,
  showConfigArgs,
  tscArgs,
  typeCheckConfigText,
  typeCheckFailure,
  typeCheckTargets,
  typeErrorsIn,
} from './type-check.mjs'

describe('typeCheckTargets', () => {
  it('groups RED files by the tsconfig that covers them and skips .mjs', () => {
    const files = ['core/a.test.ts', 'scripts/x.test.ts', 'scripts/y.test.mjs']
    expect(typeCheckTargets(files)).toEqual([
      { config: 'tsconfig.json', files: ['core/a.test.ts'] },
      { config: 'tsconfig.tooling.json', files: ['scripts/x.test.ts'] },
    ])
  })

  it('treats .ts, .tsx, .mts, and .cts as TypeScript and leaves out .js and .cjs', () => {
    const files = ['a.tsx', 'b.mts', 'c.cts', 'd.js', 'e.cjs', 'f.ts']
    expect(typeCheckTargets(files)).toEqual([
      { config: 'tsconfig.json', files: ['a.tsx', 'b.mts', 'c.cts', 'f.ts'] },
    ])
  })

  it('lists tsconfig.json first, keeps input order, and omits empty groups', () => {
    const files = ['scripts/b.ts', 'core/z.ts', 'scripts/a.ts', 'core/a.ts']
    expect(typeCheckTargets(files)).toEqual([
      { config: 'tsconfig.json', files: ['core/z.ts', 'core/a.ts'] },
      { config: 'tsconfig.tooling.json', files: ['scripts/b.ts', 'scripts/a.ts'] },
    ])
    expect(typeCheckTargets(['scripts/a.ts'])).toEqual([
      { config: 'tsconfig.tooling.json', files: ['scripts/a.ts'] },
    ])
  })

  it('sends TypeScript files under .storybook to the tooling config', () => {
    expect(typeCheckTargets(['.storybook/design-language-decorator.test.tsx'])).toEqual([
      { config: 'tsconfig.tooling.json', files: ['.storybook/design-language-decorator.test.tsx'] },
    ])
  })

  it('gives no targets for no files', () => {
    expect(typeCheckTargets([])).toEqual([])
  })
})

describe('typeCheckConfigText', () => {
  it('writes a tsconfig that checks the declaration files and the given files', () => {
    const text = typeCheckConfigText(
      'tsconfig.json',
      ['core/a.test.ts', 'core/b.test.ts'],
      ['src/vite-env.d.ts', 'storage/fs/file-system-access.d.ts'],
    )
    expect(JSON.parse(text)).toEqual({
      extends: '../tsconfig.json',
      include: [],
      files: [
        '../src/vite-env.d.ts',
        '../storage/fs/file-system-access.d.ts',
        '../core/a.test.ts',
        '../core/b.test.ts',
      ],
    })
  })

  it('lists only the given files when there are no declaration files', () => {
    const text = typeCheckConfigText('tsconfig.json', ['core/a.test.ts'], [])
    expect(JSON.parse(text)).toEqual({
      extends: '../tsconfig.json',
      include: [],
      files: ['../core/a.test.ts'],
    })
  })
})

describe('showConfigArgs', () => {
  it('asks tsc to print the resolved config', () => {
    expect(showConfigArgs('tsconfig.json')).toEqual([
      'exec',
      'tsc',
      '--showConfig',
      '-p',
      'tsconfig.json',
    ])
  })
})

describe('declarationFiles', () => {
  it('keeps the .d.ts entries of files, without a leading ./, in order', () => {
    const text =
      '{"compilerOptions":{},"files":["./src/vite-env.d.ts","./core/a.ts",' +
      '"./storage/fs/file-system-access.d.ts"],"include":["src"]}'
    expect(declarationFiles(text)).toEqual([
      'src/vite-env.d.ts',
      'storage/fs/file-system-access.d.ts',
    ])
  })

  it('gives null when the text is not JSON, not an object, or has no files array', () => {
    expect(declarationFiles('not json')).toBeNull()
    expect(declarationFiles('[1]')).toBeNull()
    expect(declarationFiles('null')).toBeNull()
    expect(declarationFiles('{"include":["src"]}')).toBeNull()
    expect(declarationFiles('{"files":"a.d.ts"}')).toBeNull()
  })
})

describe('typeCheckFailure', () => {
  it('reports a located-free error line even when located errors exist', () => {
    const output =
      "error TS5083: Cannot read file '/x/tsconfig.json'.\n" +
      'core/a.test.ts(4,7): error TS2554: Expected 1 arguments, but got 2.'
    const detail = typeCheckFailure(2, output)
    expect(typeof detail).toBe('string')
    expect(detail).not.toBe('')
  })

  it('reports a nonzero status with no located error line', () => {
    const detail = typeCheckFailure(1, 'something broke')
    expect(typeof detail).toBe('string')
    expect(detail).not.toBe('')
  })

  it('reports nothing for a clean run', () => {
    expect(typeCheckFailure(0, '')).toBeNull()
  })

  it('reports nothing for status 2 with only located errors', () => {
    expect(
      typeCheckFailure(2, 'core/a.test.ts(4,7): error TS2554: Expected 1 arguments, but got 2.'),
    ).toBeNull()
  })
})

describe('tscArgs', () => {
  it('runs tsc without emitting or colors against the given config', () => {
    expect(tscArgs('.green-proof/tsconfig.json')).toEqual([
      'exec',
      'tsc',
      '--noEmit',
      '--pretty',
      'false',
      '-p',
      '.green-proof/tsconfig.json',
    ])
  })
})

describe('typeErrorsIn', () => {
  it('keeps only type errors located in the RED files', () => {
    const output =
      'core/a.test.ts(4,7): error TS2554: Expected 1 arguments, but got 2.\n' +
      'core/b.ts(1,1): error TS1: x'
    expect(typeErrorsIn(output, ['core/a.test.ts'])).toEqual([
      'core/a.test.ts(4,7): error TS2554: Expected 1 arguments, but got 2.',
    ])
  })

  it('matches the file name exactly, not as a prefix or suffix', () => {
    const output =
      'core/a.test.tsx(1,1): error TS1: x\nxcore/a.test.ts(1,1): error TS2: y\n' +
      'core/a.test.ts(2,2): error TS3: z'
    expect(typeErrorsIn(output, ['core/a.test.ts'])).toEqual(['core/a.test.ts(2,2): error TS3: z'])
  })

  it('drops errors without a file location and indented continuation lines', () => {
    const output =
      "error TS5083: Cannot read file 'tsconfig.json'.\n" +
      'core/a.test.ts(4,7): error TS2322: Type is wrong.\n' +
      "  Type 'string' is not assignable to type 'number'."
    expect(typeErrorsIn(output, ['core/a.test.ts'])).toEqual([
      'core/a.test.ts(4,7): error TS2322: Type is wrong.',
    ])
  })

  it('gives no errors for empty output', () => {
    expect(typeErrorsIn('', ['core/a.test.ts'])).toEqual([])
  })
})
