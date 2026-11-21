import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import {
  VERSION_FIXTURE_VERSIONS,
  versionFixtureBytes,
} from '../../tests/fixtures/projects/versions'
import {
  documentOfHigherRevision,
  documentWithExtensions,
} from '../../tests/storage/conformance/conformance-documents'
import {
  IN_FOLDER,
  createTestPorts,
  openOrThrow,
  placeDocument,
  rememberFolder,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'

describe('a document that passes the format check opens through the handle', () => {
  it.each(VERSION_FIXTURE_VERSIONS)(
    'opens the fixture of schema version %i from the workspace',
    async (version) => {
      const ports = createTestPorts()
      await placeDocument(ports, PROJECT_ID, versionFixtureBytes(version))

      const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

      expect(handle.session.getProject().meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    },
  )

  it.each(VERSION_FIXTURE_VERSIONS)(
    'opens the fixture of schema version %i from a folder',
    async (version) => {
      const ports = createTestPorts()
      await rememberFolder(ports, PROJECT_ID, versionFixtureBytes(version))

      const handle = await openOrThrow(ports, { id: PROJECT_ID, location: IN_FOLDER })

      expect(handle.session.getProject().meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    },
  )

  it('opens a document of a higher revision that holds a field this build does not define', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentOfHigherRevision())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(handle.id).toBe(PROJECT_ID)
  })

  it('opens a document with data under extensions', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentWithExtensions())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(handle.id).toBe(PROJECT_ID)
  })
})
