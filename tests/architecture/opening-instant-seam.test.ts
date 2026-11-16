// @vitest-environment node
// readLayerSources reads the layer directories through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLayerSources } from './import-graph'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

const REMOVED_CONSTANT = 'DEFAULT_OBSERVATION_INSTANT'
const REFERENCE_CONSTANT = 'DAYLIGHT_REFERENCE_INSTANT'

// The files that own the reference instant, or re-export it for the layers above core.
const REFERENCE_CONSTANT_OWNERS: readonly string[] = [
  'core/environment/opening-instant.ts',
  'core/environment/daylight-reference.ts',
  'core/index.ts',
]

const TEST_FILE_PATTERN = /\.test\.tsx?$/

function isTestFile(path: string): boolean {
  return TEST_FILE_PATTERN.test(path)
}

/** Paths of the layer sources whose text names `identifier` as a whole word. */
function pathsNaming(
  sources: ReadonlyMap<string, string>,
  identifier: string,
  include: (path: string) => boolean,
): string[] {
  const wholeWord = new RegExp(`\\b${identifier}\\b`)
  return [...sources]
    .filter(([path, text]) => include(path) && wholeWord.test(text))
    .map(([path]) => path)
    .sort()
}

describe('the opening instant seam', () => {
  const sources = readLayerSources(repositoryRoot)

  it('keeps no source file naming the removed default observation instant', () => {
    expect(pathsNaming(sources, REMOVED_CONSTANT, () => true)).toEqual([])
  })

  it('keeps the daylight reference instant out of every non-test file except its owners', () => {
    const outsideTheOwners = (path: string): boolean =>
      !isTestFile(path) && !REFERENCE_CONSTANT_OWNERS.includes(path)

    expect(pathsNaming(sources, REFERENCE_CONSTANT, outsideTheOwners)).toEqual([])
  })
})
