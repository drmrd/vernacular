// @vitest-environment node
// The sources are read from disk through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { filesImportingNames, readLayerSources } from './import-graph'
import type { NamedImportRule } from './import-graph'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

// Reading about 1,500 source files to scan their imports outlasts the default limit under load.
const SOURCE_SCAN_TIMEOUT_MS = 30_000

const PORTS_BUILDER = 'app/create-session-ports.ts'
const PLANTED_FILE = 'app/sample.ts'

const INDEX_NAMES: readonly string[] = [
  'ProjectIndex',
  'InMemoryProjectIndex',
  'IndexedDbProjectIndex',
  'withMemoryFallback',
]

const STORE_NAMES: readonly string[] = [
  'ProjectStore',
  'DocumentStore',
  'WorkspaceDocumentStore',
  'InMemoryProjectStore',
  'IndexedDbProjectStore',
  'OpfsProjectStore',
  'ZipBundleProjectStore',
  'FileSystemFolderProjectStore',
  'createOpfsProjectStore',
  ...INDEX_NAMES,
]

const APP_RULE: NamedImportRule = { layer: 'app', names: STORE_NAMES, exempt: [PORTS_BUILDER] }

const IMPORTS_DOCUMENT_STORE =
  "import { DocumentStore } from '../storage'\nexport const store = DocumentStore\n"
const IMPORTS_INDEX_CLASS =
  "import { IndexedDbProjectIndex } from '../storage'\nexport const index = new IndexedDbProjectIndex()\n"
const REACHES_WORKSPACE =
  "import type { SessionPorts } from '../session'\nexport const read = (ports: SessionPorts) => ports.workspace.read('a')\n"
const REACHES_INDEX =
  "import type { SessionPorts } from '../session'\nexport const records = (ports: SessionPorts) => ports.index.all()\n"

function reportedFor(path: string, text: string): string[] {
  return filesImportingNames(new Map([[path, text]]), APP_RULE)
}

describe('finding the production files of app that reach a store directly', () => {
  it('names a planted file of app that imports DocumentStore', () => {
    expect(reportedFor(PLANTED_FILE, IMPORTS_DOCUMENT_STORE)).toEqual([
      'app/sample.ts: DocumentStore',
    ])
  })

  it('names a planted file of app that imports IndexedDbProjectIndex', () => {
    expect(reportedFor(PLANTED_FILE, IMPORTS_INDEX_CLASS)).toEqual([
      'app/sample.ts: IndexedDbProjectIndex',
    ])
  })

  it('names a type-only import and a renamed import', () => {
    const sources = new Map([
      [
        'app/typed.ts',
        "import type { ProjectStore } from '../session'\nexport type S = ProjectStore\n",
      ],
      [
        'app/renamed.ts',
        "import { InMemoryProjectStore as Store } from '../storage'\nexport const s = Store\n",
      ],
    ])

    expect(filesImportingNames(sources, APP_RULE)).toEqual([
      'app/renamed.ts: InMemoryProjectStore',
      'app/typed.ts: ProjectStore',
    ])
  })

  it('names a re-export of a store name from any path', () => {
    const text = "export { type WorkspaceDocumentStore as Workspace } from '../session/stores'\n"

    expect(reportedFor(PLANTED_FILE, text)).toEqual(['app/sample.ts: WorkspaceDocumentStore'])
  })

  it.each([
    ['a namespace import', "import * as storage from '../storage'\nexport const s = storage\n"],
    ['an export of everything', "export * from '../storage/documents'\n"],
  ])('names %s of storage', (_label, text) => {
    expect(reportedFor(PLANTED_FILE, text)).toEqual(['app/sample.ts: *'])
  })

  it('does not name a namespace import of another layer', () => {
    const text = "import * as core from '../core'\nexport const c = core\n"

    expect(reportedFor(PLANTED_FILE, text)).toEqual([])
  })

  it('names a planted file that reaches the workspace member of the ports', () => {
    expect(reportedFor(PLANTED_FILE, REACHES_WORKSPACE)).toEqual(['app/sample.ts: .workspace'])
  })

  it.each([
    ['a destructuring', 'const { workspace } = ports\nexport const read = workspace\n'],
    [
      'a destructuring that renames it',
      'const { workspace: store } = ports\nexport const s = store\n',
    ],
    ['a destructuring in a parameter', 'export const read = ({ workspace }: Ports) => workspace\n'],
    ['an element access with a string literal', "export const s = ports['workspace']\n"],
  ])('names a planted file that reaches the workspace of the ports by %s', (_label, text) => {
    expect(reportedFor(PLANTED_FILE, text)).toEqual(['app/sample.ts: .workspace'])
  })

  it('names a planted file that reaches the index member of the ports', () => {
    expect(reportedFor(PLANTED_FILE, REACHES_INDEX)).toEqual(['app/sample.ts: .index'])
  })

  it.each([
    ['a destructuring', 'const { index } = ports\nexport const records = index\n'],
    [
      'a destructuring that renames it',
      'const { index: records } = ports\nexport const r = records\n',
    ],
    ['a destructuring in a parameter', 'export const records = ({ index }: Ports) => index\n'],
    ['an element access with a string literal', "export const records = ports['index']\n"],
  ])('names a planted file that reaches the index of the ports by %s', (_label, text) => {
    expect(reportedFor(PLANTED_FILE, text)).toEqual(['app/sample.ts: .index'])
  })

  it('does not name an object literal with a workspace property or an indexed type', () => {
    const text = [
      "import type { SessionPorts } from '../session'",
      "export type Store = SessionPorts['workspace']",
      'export const build = (store: Store) => ({ workspace: store })',
      'export const buildShort = (workspace: Store) => ({ workspace })',
      '',
    ].join('\n')

    expect(reportedFor(PLANTED_FILE, text)).toEqual([])
  })

  it.each([
    'app/sample.test.ts',
    'app/sample.test.tsx',
    'app/sample.stories.tsx',
    'app/sample-test-support.tsx',
    PORTS_BUILDER,
  ])('leaves out tests, stories, test support, and app/create-session-ports.ts: %s', (path) => {
    const text = `${IMPORTS_DOCUMENT_STORE}${REACHES_WORKSPACE}`

    expect(reportedFor(path, text)).toEqual([])
  })

  it('leaves out a file of another layer', () => {
    expect(reportedFor('editor/sample.ts', IMPORTS_DOCUMENT_STORE)).toEqual([])
  })
})

describe('the production files of app', () => {
  it(
    'no production file in app except app/create-session-ports.ts imports a store class',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const reported = filesImportingNames(readLayerSources(repositoryRoot), APP_RULE)

      expect(reported, 'files of app that reach a store other than through the flows').toEqual([])
    },
  )

  it(
    'no production file in app except app/create-session-ports.ts imports an index class or reaches the index member',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const indexNames = [...INDEX_NAMES, '.index']
      const reported = filesImportingNames(readLayerSources(repositoryRoot), APP_RULE).filter(
        (line) => indexNames.some((name) => line.endsWith(`: ${name}`)),
      )

      expect(reported, 'files of app that reach the project index directly').toEqual([])
    },
  )
})
