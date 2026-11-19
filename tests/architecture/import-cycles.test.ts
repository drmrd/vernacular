// @vitest-environment node
// The import graph is read from disk through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { findValueImportCycles, readLayerSources } from './import-graph'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

type SourceFile = readonly [path: string, text: string]

function cyclesIn(files: readonly SourceFile[]): string[][] {
  return findValueImportCycles(new Map(files))
}

function filesOfEachCycle(cycles: string[][]): string[][] {
  return cycles.map((cycle) => [...cycle].sort())
}

function describeCycles(cycles: string[][]): string {
  const lines = cycles.map((cycle) => `  ${cycle.join(' -> ')}`)
  return `Value-import cycles among layer files:\n${lines.join('\n')}`
}

const importsB = "import { b } from './b'\nexport const a = b\n"
const importsA = "import { a } from './a'\nexport const b = a\n"

describe('value-import cycle detection', () => {
  it('reports two files that import a value from each other as one cycle naming both', () => {
    const cycles = cyclesIn([
      ['core/a.ts', importsB],
      ['core/b.ts', importsA],
    ])

    expect(filesOfEachCycle(cycles)).toEqual([['core/a.ts', 'core/b.ts']])
  })

  it('reports no cycle for two files that only import types from each other', () => {
    const cycles = cyclesIn([
      ['core/a.ts', "import type { B } from './b'\nexport type A = B\n"],
      ['core/b.ts', "import type { A } from './a'\nexport type B = A\n"],
    ])

    expect(cycles).toEqual([])
  })

  it('treats an import whose only specifier is marked type as type-only', () => {
    const cycles = cyclesIn([
      ['core/a.ts', "import { type B } from './b'\nexport type A = B\n"],
      ['core/b.ts', "import { type A } from './a'\nexport type B = A\n"],
    ])

    expect(cycles).toEqual([])
  })

  it('treats an import that mixes a type specifier with a value specifier as a value import', () => {
    const cycles = cyclesIn([
      ['core/a.ts', "import { type B, b } from './b'\nexport const a = b\nexport type A = B\n"],
      ['core/b.ts', importsA],
    ])

    expect(filesOfEachCycle(cycles)).toEqual([['core/a.ts', 'core/b.ts']])
  })

  it.each([
    ['a named re-export', "export { b } from './b'\n"],
    ['a star re-export', "export * from './b'\n"],
  ])('counts %s as a value import', (_label, reexport) => {
    const cycles = cyclesIn([
      ['core/a.ts', reexport],
      ['core/b.ts', importsA],
    ])

    expect(filesOfEachCycle(cycles)).toEqual([['core/a.ts', 'core/b.ts']])
  })

  it('does not count a dynamic import() as a value import', () => {
    const cycles = cyclesIn([
      ['core/a.ts', "export const load = () => import('./b')\n"],
      ['core/b.ts', importsA],
    ])

    expect(cycles).toEqual([])
  })

  it.each([
    ['a .ts file', 'core/b.ts', importsA],
    ['a .tsx file', 'core/b.tsx', importsA],
    ['an index.ts file in a directory', 'core/b/index.ts', "import { a } from '../a'\n"],
  ])('resolves an extensionless specifier to %s', (_label, targetPath, targetSource) => {
    const cycles = cyclesIn([
      ['core/a.ts', importsB],
      [targetPath, targetSource],
    ])

    expect(filesOfEachCycle(cycles)).toEqual([['core/a.ts', targetPath]])
  })

  it('ignores a specifier that names no file among the sources', () => {
    const cycles = cyclesIn([
      [
        'core/a.ts',
        "import { x } from 'some-package'\nimport { y } from './missing'\nexport const a = [x, y]\n",
      ],
    ])

    expect(cycles).toEqual([])
  })
})

describe('the repository import graph', () => {
  let sources: Map<string, string>

  beforeAll(() => {
    sources = readLayerSources(repositoryRoot)
  })

  it('has no value-import cycle among the files of the seven layers', () => {
    const cycles = findValueImportCycles(sources)

    expect([...sources.keys()], 'sources read from the seven layers').toContain('core/index.ts')
    expect(cycles, describeCycles(cycles)).toEqual([])
  })

  it('reads the files of the session layer as part of the graph', () => {
    const paths = [...sources.keys()]

    expect(paths.some((path) => path.startsWith('session/'))).toBe(true)
  })
})
