// The virtual programs and helpers that the samples of the wall end detector share.
import { expect, it } from 'vitest'
import {
  describeWallEndRead,
  findWallEndReads,
  programOfVirtualFiles,
  type WallEndForm,
} from './wall-end-reads-test-support'

export const ROOT = '/virtual-repository'
export const SAMPLE_TIMEOUT_MS = 30_000

/** A virtual source file: its repository-relative path and its text. */
export type Source = [path: string, text: string]

/** A sample program and the reads, as `file:line form`, that the detector must report. */
export type Sample = [title: string, sources: Source[], reads: string[]]

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

export const WALL_IMPORT = "import type { Wall } from '../core/model/types'"
const POINT_IMPORT = "import type { Point } from '../model/types'"
export const SEGMENT = '{ start: Point; end: Point }'
const CALLER_PARAMETERS = 'wall: Wall, walls: Wall[], maybe: Wall[] | undefined'

export function readsIn(sources: readonly Source[]): string[] {
  const program = programOfVirtualFiles(ROOT, [...BASE_SOURCES, ...sources])
  return findWallEndReads(program, ROOT).map(describeWallEndRead)
}

/** A file of `editor/` whose first line imports the wall type, so `body` starts on line 2. */
export function editorFile(body: string, name = 'a'): Source {
  return [`editor/${name}.ts`, `${WALL_IMPORT}\n${body}`]
}

/** A callee in `core/scene/b.ts` and a caller in `editor/c.ts` whose call is on line 3. */
export function callerOf(declaration: string, call: string): Source[] {
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

export function useWith(parameter: string): string {
  return `export function use(_value: ${parameter}): number { return 0 }`
}

/** One test per sample: the detector reports exactly the sample's reads. */
export function expectEachSample(samples: readonly Sample[]): void {
  it.each(samples)(
    '%s',
    (_title, sources, reads) => {
      expect(readsIn(sources)).toEqual(reads)
    },
    SAMPLE_TIMEOUT_MS,
  )
}

/** A sample whose `editor/a.ts` reads a wall end on line 2 with the arrow function `read`. */
export function derivedSample(title: string, read: string, form: WallEndForm = 'access'): Sample {
  return [title, [editorFile(`export const read = ${read}`)], [`editor/a.ts:2 ${form}`]]
}
