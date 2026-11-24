// @vitest-environment node
// The rule reads a TypeScript program, which needs Node's fs module, not the project-wide jsdom.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type ts from 'typescript'
import { WALL_END_READ_EXCEPTIONS } from './wall-end-read-exceptions'
import {
  describeWallEndRead,
  findWallEndReads,
  programOfConfig,
  wallEndReadFiles,
  wallTypesDeclaredIn,
} from './wall-end-reads-test-support'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const PROGRAM_TIMEOUT_MS = 120_000

describe('wall ends are read through the wall path', () => {
  let program: ts.Program

  beforeAll(() => {
    program = programOfConfig(join(repositoryRoot, 'tsconfig.json'))
  }, PROGRAM_TIMEOUT_MS)

  it('finds the wall types it checks by, so an empty list means no reads', () => {
    expect(wallTypesDeclaredIn(program, repositoryRoot)).toEqual(['Wall', 'WallSceneNode'])
  })

  it(
    'reads wall ends only in the files of the exception list',
    () => {
      const reads = findWallEndReads(program, repositoryRoot)
      const files = wallEndReadFiles(reads)
      const unlisted = reads
        .filter(({ file }) => !WALL_END_READ_EXCEPTIONS.includes(file))
        .map(describeWallEndRead)
      const stale = WALL_END_READ_EXCEPTIONS.filter((file) => !files.includes(file))
      const message = [
        `Wall ends read outside the exception list:\n${unlisted.join('\n')}`,
        `Listed files with no wall end read:\n${stale.join('\n')}`,
      ].join('\n')
      expect(files, message).toEqual([...WALL_END_READ_EXCEPTIONS])
    },
    PROGRAM_TIMEOUT_MS,
  )

  it('keeps the exception list sorted and free of repeats', () => {
    const sortedUnique = [...new Set(WALL_END_READ_EXCEPTIONS)].sort()
    expect([...WALL_END_READ_EXCEPTIONS]).toEqual(sortedUnique)
  })
})

describe('programOfConfig', () => {
  let directory: string

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wall-end-reads-'))
  })

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('throws when the config file cannot be read', () => {
    expect(() => programOfConfig(join(directory, 'missing.json'))).toThrow(/missing\.json/)
  })

  it('throws when the config file is not valid JSON', () => {
    const path = join(directory, 'broken.json')
    writeFileSync(path, '{ "compilerOptions": { "strict": ')
    expect(() => programOfConfig(path)).toThrow(/broken\.json/)
  })

  it('throws when the config holds an option that does not exist', () => {
    const path = join(directory, 'tsconfig.json')
    writeFileSync(path, JSON.stringify({ compilerOptions: { target: 'not-a-target' } }))
    expect(() => programOfConfig(path)).toThrow(/target/i)
  })
})
