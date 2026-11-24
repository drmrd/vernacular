// @vitest-environment node
// The detector reads a TypeScript program, which needs Node's fs module, not the project-wide jsdom.
import { describe, expect, it } from 'vitest'
import {
  describeWallEndRead,
  findWallEndReads,
  programOfVirtualFiles,
} from './wall-end-reads-test-support'

const ROOT = '/virtual-repository'
const SAMPLE_TIMEOUT_MS = 30_000

/** A virtual source file: its repository-relative path and its text. */
type Source = [path: string, text: string]

/** A sample program and the reads, as `file:line form`, that the detector must report. */
type Sample = [title: string, sources: Source[], reads: string[]]

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
const SEGMENT = '{ start: Point; end: Point }'
const CALLER_PARAMETERS = 'wall: Wall, walls: Wall[], maybe: Wall[] | undefined'

function readsIn(sources: readonly Source[]): string[] {
  const program = programOfVirtualFiles(ROOT, [...BASE_SOURCES, ...sources])
  return findWallEndReads(program, ROOT).map(describeWallEndRead)
}

/** A file of `editor/` whose first line imports the wall type, so `body` starts on line 2. */
function editorFile(body: string, name = 'a'): Source {
  return [`editor/${name}.ts`, `${WALL_IMPORT}\n${body}`]
}

/** A callee in `core/scene/b.ts` and a caller in `editor/c.ts` whose call is on line 3. */
function callerOf(declaration: string, call: string): Source[] {
  const caller = [
    WALL_IMPORT,
    "import * as b from '../core/scene/b'",
    `export const call = (${CALLER_PARAMETERS}) => ${call}`,
  ]
  return [
    ['core/scene/b.ts', `${POINT_IMPORT}\n${declaration}`],
    ['editor/c.ts', caller.join('\n')],
  ]
}

function useWith(parameter: string): string {
  return `export function use(_value: ${parameter}): number { return 0 }`
}

describe('findWallEndReads, wall ends that are read', () => {
  const samples: Sample[] = [
    [
      'flags a read of start on a wall',
      [
        editorFile('export const first = (wall: Wall) => wall.start'),
        editorFile('export const last = (wall: Wall | undefined) => wall?.end', 'b'),
      ],
      ['editor/a.ts:2 access', 'editor/b.ts:2 access'],
    ],
    [
      'flags a read of end on a wall scene node, also through a union',
      [
        [
          'editor/a.ts',
          [
            "import type { DimensionSceneNode, WallSceneNode } from '../core/scene/scene-graph'",
            'export const end = (node: WallSceneNode | DimensionSceneNode) => node.end',
          ].join('\n'),
        ],
      ],
      ['editor/a.ts:2 access'],
    ],
    [
      "flags a destructuring of a wall's ends",
      [
        editorFile('export const first = (wall: Wall) => { const { start } = wall; return start }'),
        editorFile('export const last = ({ end }: Wall) => end', 'b'),
      ],
      ['editor/a.ts:2 destructuring', 'editor/b.ts:2 destructuring'],
    ],
    [
      'flags a wall passed to a parameter that has start and end',
      callerOf(useWith(SEGMENT), 'b.use(wall)'),
      ['editor/c.ts:3 argument'],
    ],
    [
      'flags walls passed to a parameter that takes a list of points with start and end',
      callerOf(useWith(`readonly ${SEGMENT}[]`), 'b.use(walls)'),
      ['editor/c.ts:3 argument'],
    ],
  ]

  it.each(samples)(
    '%s',
    (_title, sources, reads) => {
      expect(readsIn(sources)).toEqual(reads)
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
      expect(readsIn(sources)).toEqual([])
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
      expect(readsIn(sources)).toEqual([])
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
      expect(readsIn(sources)).toEqual([])
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
      expect(readsIn(sources)).toEqual([])
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
      expect(readsIn(sources)).toEqual([])
    },
    SAMPLE_TIMEOUT_MS,
  )
})

describe('findWallEndReads, the other forms of the rule', () => {
  const samples: Sample[] = [
    [
      'flags a read through an element access with a literal key',
      [editorFile("export const first = (wall: Wall) => wall['start']")],
      ['editor/a.ts:2 access'],
    ],
    [
      'flags a destructuring that renames the end',
      [editorFile('export const first = (wall: Wall) => { const { start: s } = wall; return s }')],
      ['editor/a.ts:2 destructuring'],
    ],
    [
      'flags a read on a wall in an intersection',
      [editorFile('export const first = (wall: Wall & { extra: number }) => wall.start')],
      ['editor/a.ts:2 access'],
    ],
    [
      'flags a wall passed to a constructor with a structural parameter',
      callerOf(`export class C { constructor(_value: ${SEGMENT}) {} }`, 'new b.C(wall)'),
      ['editor/c.ts:3 argument'],
    ],
    [
      'flags a wall passed to a type parameter constrained to a structural type',
      callerOf(
        `export function use<T extends ${SEGMENT}>(_value: T): number { return 0 }`,
        'b.use(wall)',
      ),
      ['editor/c.ts:3 argument'],
    ],
    [
      'flags a read through an element access with a key of type start or end',
      [editorFile("export const first = (wall: Wall, key: 'start' | 'end') => wall[key]")],
      ['editor/a.ts:2 access'],
    ],
    [
      'does not flag an element access whose key is a variable named start',
      [
        editorFile(
          "export const first = (wall: Wall) => { const start = 'id'; return wall[start] }",
        ),
      ],
      [],
    ],
    [
      'flags a read on a readonly wall',
      [editorFile('export const first = (wall: Readonly<Wall>) => wall.start')],
      ['editor/a.ts:2 access'],
    ],
    [
      'flags a nullable list of walls passed to a nullable list parameter',
      callerOf(useWith(`readonly ${SEGMENT}[] | undefined`), 'b.use(maybe)'),
      ['editor/c.ts:3 argument'],
    ],
    [
      'flags a wall passed to a rest parameter',
      callerOf(`export function use(..._values: ${SEGMENT}[]): number { return 0 }`, 'b.use(wall)'),
      ['editor/c.ts:3 argument'],
    ],
    [
      'flags walls spread into a rest parameter',
      callerOf(
        `export function use(..._values: ${SEGMENT}[]): number { return 0 }`,
        'b.use(...walls)',
      ),
      ['editor/c.ts:3 argument'],
    ],
    [
      'does not flag a wall passed to a type parameter constrained to the wall type',
      callerOf(
        "export function use<T extends import('../model/types').Wall>(_value: T): number { return 0 }",
        'b.use(wall)',
      ),
      [],
    ],
  ]

  it.each(samples)(
    '%s',
    (_title, sources, reads) => {
      expect(readsIn(sources)).toEqual(reads)
    },
    SAMPLE_TIMEOUT_MS,
  )
})
