// @vitest-environment node
// The rule reads a TypeScript program, which needs Node's fs module, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type ts from 'typescript'
import { WALL_END_READ_EXCEPTIONS } from './wall-end-read-exceptions'
import { findWallEndReads, programOfConfig, wallEndReadFiles } from './wall-end-reads-test-support'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const PROGRAM_TIMEOUT_MS = 120_000

describe('wall ends are read through the wall path', () => {
  let program: ts.Program

  beforeAll(() => {
    program = programOfConfig(join(repositoryRoot, 'tsconfig.json'))
  }, PROGRAM_TIMEOUT_MS)

  it(
    'reads wall ends only in the files of the exception list',
    () => {
      const files = wallEndReadFiles(findWallEndReads(program, repositoryRoot))
      expect(files).toEqual([...WALL_END_READ_EXCEPTIONS])
    },
    PROGRAM_TIMEOUT_MS,
  )

  it('keeps the exception list sorted and free of repeats', () => {
    const sortedUnique = [...new Set(WALL_END_READ_EXCEPTIONS)].sort()
    expect([...WALL_END_READ_EXCEPTIONS]).toEqual(sortedUnique)
  })
})
