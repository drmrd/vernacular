// @vitest-environment node
// The detector reads a TypeScript program, which needs Node's fs module, not the project-wide jsdom.
import { describe, expect, it } from 'vitest'
import {
  callerOf,
  derivedSample,
  editorFile,
  expectEachSample,
  readsIn,
  ROOT,
  SAMPLE_TIMEOUT_MS,
  SEGMENT,
  type Sample,
  type Source,
  useWith,
  WALL_IMPORT,
} from './wall-end-read-samples-test-support'
import { programOfVirtualFiles, wallTypesDeclaredIn } from './wall-end-reads-test-support'

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

  expectEachSample(samples)
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

  expectEachSample(samples)
})

describe('findWallEndReads, types derived from a wall type', () => {
  const samples: Sample[] = [
    derivedSample(
      'flags a read on a pick of a wall',
      "(wall: Pick<Wall, 'start' | 'end'>) => wall.start",
    ),
    derivedSample('flags a read on a wall without its id', "(wall: Omit<Wall, 'id'>) => wall.end"),
    derivedSample('flags a read on a partial wall', '(wall: Partial<Wall>) => wall.start'),
    derivedSample(
      'flags a read on a type parameter of the wall type',
      '<T extends Wall>(w: T) => w.end',
    ),
    derivedSample(
      'flags an element access on a pick of a wall',
      "(w: Pick<Wall, 'end'>) => w['end']",
    ),
    derivedSample(
      'flags a destructuring of a pick of a wall',
      "({ start }: Pick<Wall, 'start'>) => start",
      'destructuring',
    ),
    [
      'flags a read on an interface that extends the wall',
      [
        editorFile(
          'export interface Ext extends Wall { extra: number }\nexport const read = (wall: Ext) => wall.start',
        ),
      ],
      ['editor/a.ts:3 access'],
    ],
    [
      'does not flag a read on a pick of another type with start and end',
      [
        [
          'editor/a.ts',
          "import type { DimensionSceneNode as D } from '../core/scene/scene-graph'\n" +
            "export const read = (node: Pick<D, 'start'>) => node.start",
        ],
      ],
      [],
    ],
  ]

  expectEachSample(samples)
})

describe('wallTypesDeclaredIn', () => {
  it(
    'leaves out a wall type that is no longer an interface with start or end',
    () => {
      const sources: Source[] = [
        ['core/model/types.ts', 'export type Wall = { start: number; end: number }'],
        ['core/scene/scene-graph.ts', 'export interface WallSceneNode { end: number }'],
      ]
      expect(wallTypesDeclaredIn(programOfVirtualFiles(ROOT, sources), ROOT)).toEqual([
        'WallSceneNode',
      ])
    },
    SAMPLE_TIMEOUT_MS,
  )
})
