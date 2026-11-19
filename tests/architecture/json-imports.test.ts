// @vitest-environment node
// The sources are read from disk through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readLayerSources } from './import-graph'
import { findJsonImportsWithoutAttribute } from './json-import-attributes'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

function describeOffenders(offenders: readonly string[]): string {
  return `A .json import in core/ needs the attribute with { type: 'json' } (plain Node tools load core/):\n${offenders.join('\n')}`
}

describe('JSON import attribute detection', () => {
  it('accepts a .json import that carries the json import attribute', () => {
    const source = "import data from './data.json' with { type: 'json' }\nexport default data\n"

    expect(findJsonImportsWithoutAttribute('core/a.ts', source)).toEqual([])
  })

  it('reports a .json import with no import attribute by its specifier', () => {
    const source = "import data from './data.json'\nexport default data\n"

    expect(findJsonImportsWithoutAttribute('core/a.ts', source)).toEqual(['./data.json'])
  })

  it('does not report a .json import in a file outside core', () => {
    const source = "import data from './data.json'\nexport default data\n"

    expect(findJsonImportsWithoutAttribute('app/x.ts', source)).toEqual([])
  })

  it('does not report an import of a file that is not JSON', () => {
    const source = "import { b } from './b'\nexport const a = b\n"

    expect(findJsonImportsWithoutAttribute('core/a.ts', source)).toEqual([])
  })

  it('does not report a type-only import of a .json file', () => {
    const source = "import type Data from './data.json'\nexport type A = typeof Data\n"

    expect(findJsonImportsWithoutAttribute('core/a.ts', source)).toEqual([])
  })
})

describe('the files under core', () => {
  it('import every .json file with the json import attribute', () => {
    const sources = readLayerSources(repositoryRoot)
    const offenders = [...sources].flatMap(([path, text]) =>
      findJsonImportsWithoutAttribute(path, text).map((specifier) => `  ${path}: ${specifier}`),
    )

    expect([...sources.keys()], 'sources read from the seven layers').toContain('core/index.ts')
    expect(offenders, describeOffenders(offenders)).toEqual([])
  })
})
