// @vitest-environment node
// The sources are read from disk through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLayerSources } from './import-graph'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

const CODEC_FUNCTIONS: readonly string[] = [
  'migrateProject',
  'isMigrationPending',
  'createDocumentValidator',
  'createTolerantValidator',
  'createStrictValidator',
  'checkCurrentSchema',
  'parseDocumentJson',
  'serializeDocumentJson',
]

const CODEC_DIRECTORIES: readonly string[] = ['core/format/', 'core/migrations/']

// A re-export calls nothing, and a production file that uses a name must still name it, so the rule catches the user.
const CODEC_BARREL = 'core/index.ts'

// The repair offer checks a repaired document against the current schema, so the files of `core/repairs/` may name that one function and no other.
const REPAIRS_DIRECTORY = 'core/repairs/'
const NAMED_BY_THE_REPAIRS = 'checkCurrentSchema'

const NON_PRODUCTION_PATTERN = /\.(test|spec|stories)\.tsx?$|\.d\.ts$|(^|\/)__tests__\//

function isProductionOutsideTheCodec(path: string, identifier: string): boolean {
  if (NON_PRODUCTION_PATTERN.test(path) || path === CODEC_BARREL) return false
  if (path.startsWith(REPAIRS_DIRECTORY) && identifier === NAMED_BY_THE_REPAIRS) return false
  return !CODEC_DIRECTORIES.some((directory) => path.startsWith(directory))
}

/**
 * Every `path:line` outside the codec that names `identifier` as a whole word.
 * Comments are not stripped, so a comment that names the function counts too.
 */
function findNamingsOutsideTheCodec(
  sources: ReadonlyMap<string, string>,
  identifier: string,
): string[] {
  const wholeWord = new RegExp(`\\b${identifier}\\b`)
  return [...sources]
    .filter(([path]) => isProductionOutsideTheCodec(path, identifier))
    .flatMap(([path, text]) =>
      text
        .split('\n')
        .flatMap((line, index) => (wholeWord.test(line) ? [`${path}:${index + 1}`] : [])),
    )
    .sort()
}

function describeNamings(identifier: string, namings: readonly string[]): string {
  return `Only the codec (core/format/, core/migrations/) may name ${identifier}:\n${namings.map((naming) => `  ${naming}`).join('\n')}`
}

function plantedSource(path: string, text: string): Map<string, string> {
  return new Map([[path, text]])
}

const CALLING_SAMPLE = 'export const upgraded = migrateProject(raw)\n'

describe('the codec-only rule scan', () => {
  it('reports the path and line of a production file outside the codec that calls a codec function', () => {
    const sources = plantedSource(
      'storage/project/sample.ts',
      `import { raw } from './raw'\n${CALLING_SAMPLE}`,
    )

    expect(findNamingsOutsideTheCodec(sources, 'migrateProject')).toEqual([
      'storage/project/sample.ts:2',
    ])
  })

  it('reports a file outside the codec, in core, but not a file in the format or migrations folders', () => {
    const reportedFor = (path: string): string[] =>
      findNamingsOutsideTheCodec(plantedSource(path, CALLING_SAMPLE), 'migrateProject')

    expect(reportedFor('core/model/x.ts')).toEqual(['core/model/x.ts:1'])
    expect(reportedFor('core/format-extras/x.ts')).toEqual(['core/format-extras/x.ts:1'])
    expect(reportedFor('core/format/x.ts')).toEqual([])
    expect(reportedFor('core/migrations/x.ts')).toEqual([])
  })

  it('exempts only the exact path of the core barrel', () => {
    const reportedFor = (path: string): string[] =>
      findNamingsOutsideTheCodec(plantedSource(path, CALLING_SAMPLE), 'migrateProject')

    expect(reportedFor('core/index.ts')).toEqual([])
    expect(reportedFor('core/model/index.ts')).toEqual(['core/model/index.ts:1'])
  })

  it('leaves out tests, stories, and declaration files', () => {
    const reportedFor = (path: string): string[] =>
      findNamingsOutsideTheCodec(plantedSource(path, CALLING_SAMPLE), 'migrateProject')

    expect(reportedFor('storage/sample.test.ts')).toEqual([])
    expect(reportedFor('editor/sample.stories.tsx')).toEqual([])
    expect(reportedFor('storage/sample.d.ts')).toEqual([])
  })
})

describe('the files of core/repairs', () => {
  it('a file under core/repairs may name checkCurrentSchema', () => {
    const sources = plantedSource(
      'core/repairs/find-repair-offer.ts',
      'export const faults = checkCurrentSchema(document, mode)\n',
    )

    expect(findNamingsOutsideTheCodec(sources, 'checkCurrentSchema')).toEqual([])
  })

  it('a file under core/repairs that names another codec function is reported', () => {
    const sources = plantedSource('core/repairs/find-repair-offer.ts', CALLING_SAMPLE)

    expect(findNamingsOutsideTheCodec(sources, 'migrateProject')).toEqual([
      'core/repairs/find-repair-offer.ts:1',
    ])
  })
})

describe('the production files outside the codec', () => {
  const sources = readLayerSources(repositoryRoot)

  it('are read from the layers, with the codec among them', () => {
    expect([...sources.keys()], 'sources read from the layers').toContain('core/format/index.ts')
  })

  it.each(CODEC_FUNCTIONS)('never name %s', (identifier) => {
    const namings = findNamingsOutsideTheCodec(sources, identifier)

    expect(namings, describeNamings(identifier, namings)).toEqual([])
  })
})
