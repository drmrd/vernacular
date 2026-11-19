// @vitest-environment node
// A node run shows that the editor core needs no DOM global, and the closure case reads files.
import { describe, expect, it } from 'vitest'
import { createEmptyProject, encodeDocument, renameProject } from '../../core'
import { ZipBundleProjectStore } from '../../storage'
import { exportArchive } from '../../session'
import type { DocumentHandle } from '../../session'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from '../../session/testing'
import { importClosure, readSourceFiles } from '../architecture/import-closure'
import { readLayerSources } from '../architecture/import-graph'

const PROJECT_ID = 'a'
const FIRST_NAME = 'First name'
const SECOND_NAME = 'Second name'
const THIS_FILE = 'tests/session/headless-round-trip.test.ts'
const HELPER_FILES = ['tests/architecture/import-graph.ts', 'tests/architecture/import-closure.ts']
// Reading about 1,500 source files to follow their imports outlasts the default limit under load.
const SOURCE_SCAN_TIMEOUT_MS = 30_000
// Data files and the generated schema validators are not layer sources; no code of ours is hidden there.
const DATA_OR_GENERATED_FILE = /\.(json|js)$/
const FORBIDDEN_PACKAGES = [/^react$/, /^react-dom$/, /^three$/, /^@react-three\//]

function storedFirstDocument(): Uint8Array {
  const project = createEmptyProject({
    name: FIRST_NAME,
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  return encodeDocument(project, undefined).bytes
}

async function openedWithFirstName(): Promise<DocumentHandle> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, storedFirstDocument())
  return openOrThrow(ports, workspaceRequest(PROJECT_ID))
}

function nameOf(handle: DocumentHandle): string {
  return handle.session.getProject().meta.name
}

describe('the editor core without React', () => {
  it('opens, edits, undoes, saves, and exports with no React', async () => {
    const handle = await openedWithFirstName()
    expect(nameOf(handle), 'the opened project has the stored name').toBe(FIRST_NAME)

    handle.session.dispatch(renameProject(SECOND_NAME))
    expect(nameOf(handle), 'the rename changed the name').toBe(SECOND_NAME)

    expect(handle.session.undo(), 'undo reports a change').toBe(true)
    expect(nameOf(handle), 'undo restored the stored name').toBe(FIRST_NAME)

    handle.session.dispatch(renameProject(SECOND_NAME))
    expect((await handle.save()).ok, 'save is ok').toBe(true)

    const exported = await exportArchive(handle)
    if (!exported.ok) throw new Error(`The export failed: ${exported.message}`)
    const archive = await ZipBundleProjectStore.fromBundle(PROJECT_ID, exported.bytes)
    expect(
      (await storedProject(archive, PROJECT_ID)).meta.name,
      'the document inside the archive has the new name',
    ).toBe(SECOND_NAME)

    expect((await handle.close()).ok, 'close is ok').toBe(true)
  })

  it(
    "the test file's import closure holds no React and no Three.js",
    () => {
      const repositoryRoot = decodeURIComponent(new URL('../..', import.meta.url).pathname)
      const sources = new Map([
        ...readLayerSources(repositoryRoot),
        ...readSourceFiles(repositoryRoot, [THIS_FILE, ...HELPER_FILES]),
      ])

      const { packages, unresolved } = importClosure(sources, THIS_FILE)

      const forbidden = packages.filter((name) =>
        FORBIDDEN_PACKAGES.some((pattern) => pattern.test(name)),
      )
      expect(forbidden, `forbidden packages in the closure of ${THIS_FILE}`).toEqual([])
      const hidden = unresolved.filter((entry) => !DATA_OR_GENERATED_FILE.test(entry))
      expect(hidden, 'source imports that the closure could not follow').toEqual([])
    },
    SOURCE_SCAN_TIMEOUT_MS,
  )
})
