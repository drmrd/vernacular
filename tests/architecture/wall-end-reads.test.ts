// @vitest-environment node
// The detector reads a TypeScript program, which needs Node's fs module, not the project-wide jsdom.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { findWallEndReads, wallEndReadFiles } from './wall-end-reads-test-support'

const ROOT = '/virtual-repository'
const SAMPLE_TIMEOUT_MS = 30_000

/** A virtual source file: its repository-relative path and its text. */
type Source = [path: string, text: string]

const BASE_SOURCES: Source[] = [
  [
    'core/model/types.ts',
    `
    export interface Point { x: number; y: number }
    export interface Wall { id: string; start: Point; end: Point; thickness: number }
  `,
  ],
  [
    'core/scene/scene-graph.ts',
    `
    import type { Point } from '../model/types'
    export interface WallSceneNode { id: string; kind: 'wall'; start: Point; end: Point }
    export interface DimensionSceneNode { id: string; kind: 'dimension'; start: Point; end: Point }
  `,
  ],
]

const WALL_IMPORT = "import type { Wall } from '../core/model/types'"
const POINT_IMPORT = "import type { Point } from '../model/types'"
const PARAMETER_WITH_ENDS = '{ start: Point; end: Point }'

function programFromSources(sources: readonly Source[]): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const virtual = new Map(sources.map(([path, text]) => [join(ROOT, path), text]))
  const { fileExists, readFile, directoryExists, getSourceFile } = host
  host.fileExists = (name) => virtual.has(name) || fileExists.call(host, name)
  host.readFile = (name) => virtual.get(name) ?? readFile.call(host, name)
  host.directoryExists = (name) =>
    [...virtual.keys()].some((path) => path.startsWith(`${name}/`)) ||
    (directoryExists?.call(host, name) ?? false)
  host.getSourceFile = (name, languageVersion, ...rest) => {
    const text = virtual.get(name)
    return text === undefined
      ? getSourceFile.call(host, name, languageVersion, ...rest)
      : ts.createSourceFile(name, text, languageVersion)
  }
  return ts.createProgram({ rootNames: [...virtual.keys()], options, host })
}

function flaggedFiles(sources: readonly Source[]): string[] {
  const program = programFromSources([...BASE_SOURCES, ...sources])
  return wallEndReadFiles(findWallEndReads(program, ROOT))
}

function callerOf(parameter: string, argument: string): Source[] {
  return [
    [
      'core/scene/b.ts',
      `
      ${POINT_IMPORT}
      export function use(_value: ${parameter}): number { return 0 }
    `,
    ],
    [
      'editor/c.ts',
      `
      ${WALL_IMPORT}
      import { use } from '../core/scene/b'
      export const call = (wall: Wall, walls: Wall[]) => use(${argument})
    `,
    ],
  ]
}

describe('findWallEndReads, wall ends that are read', () => {
  it(
    'flags a read of start on a wall',
    () => {
      const sources: Source[] = [
        [
          'editor/a.ts',
          `
          ${WALL_IMPORT}
          export const first = (wall: Wall) => wall.start
          export const last = (wall: Wall | undefined) => wall?.end
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual(['editor/a.ts'])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'flags a read of end on a wall scene node, also through a union',
    () => {
      const sources: Source[] = [
        [
          'editor/a.ts',
          `
          import type { DimensionSceneNode, WallSceneNode } from '../core/scene/scene-graph'
          export const end = (node: WallSceneNode | DimensionSceneNode) => node.end
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual(['editor/a.ts'])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    "flags a destructuring of a wall's ends",
    () => {
      const sources: Source[] = [
        [
          'editor/a.ts',
          `
          ${WALL_IMPORT}
          export const first = (wall: Wall) => { const { start } = wall; return start }
        `,
        ],
        [
          'editor/b.ts',
          `
          ${WALL_IMPORT}
          export const last = ({ end }: Wall) => end
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual(['editor/a.ts', 'editor/b.ts'])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'flags a wall passed to a parameter that has start and end',
    () => {
      expect(flaggedFiles(callerOf(PARAMETER_WITH_ENDS, 'wall'))).toEqual(['editor/c.ts'])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'flags walls passed to a parameter that takes a list of points with start and end',
    () => {
      const parameter = `readonly ${PARAMETER_WITH_ENDS}[]`
      expect(flaggedFiles(callerOf(parameter, 'walls'))).toEqual(['editor/c.ts'])
    },
    SAMPLE_TIMEOUT_MS,
  )
})

describe('findWallEndReads, reads that are left alone', () => {
  it(
    'does not flag a wall passed to a parameter of the wall type',
    () => {
      const sources: Source[] = [
        [
          'core/scene/b.ts',
          `
          import type { Wall } from '../model/types'
          export const identify = (wall: Wall): string => wall.id
        `,
        ],
        [
          'editor/c.ts',
          `
          ${WALL_IMPORT}
          import { identify } from '../core/scene/b'
          export const call = (wall: Wall) => identify(wall)
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'does not flag a wall passed to a kernel function',
    () => {
      const sources: Source[] = [
        [
          'core/geometry/d.ts',
          `
          import type { Wall } from '../model/types'
          export const measure = (_wall: Pick<Wall, 'start' | 'end'>): number => 0
        `,
        ],
        [
          'editor/c.ts',
          `
          ${WALL_IMPORT}
          import { measure } from '../core/geometry/d'
          export const call = (wall: Wall) => measure(wall)
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'does not flag reads inside the kernel folders',
    () => {
      const read = (folder: string): Source => [
        `${folder}x.ts`,
        `
        import type { Wall } from '../model/types'
        export const first = (wall: Wall) => wall.start
      `,
      ]
      const sources = ['core/geometry/', 'core/topology/', 'core/migrations/'].map(read)
      expect(flaggedFiles(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'does not flag test files and test assets',
    () => {
      const body = (importPath: string): string => `
        import type { Wall } from '${importPath}'
        export const first = (wall: Wall) => wall.start
      `
      const sources: Source[] = [
        ['editor/e.test.ts', body('../core/model/types')],
        ['editor/e-test-support.ts', body('../core/model/types')],
        ['core/testing/f.ts', body('../model/types')],
      ]
      expect(flaggedFiles(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )

  it(
    'does not flag start on a value of another type',
    () => {
      const sources: Source[] = [
        [
          'editor/a.ts',
          `
          import type { Point } from '../core/model/types'
          export const first = (segment: { start: Point; end: Point }) => segment.start
        `,
        ],
      ]
      expect(flaggedFiles(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )
})
