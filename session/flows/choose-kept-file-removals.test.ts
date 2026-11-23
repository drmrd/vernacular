// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DIRECTORY } from '../../storage/snapshots/snapshot-store'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  rename,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import {
  documentNamed,
  storeNewerMainBesideSecondFile,
  storeTwoReadableFiles,
} from '../handle/second-file-test-kit'
import { PROJECT_ID } from './open-failed-test-kit'

const EDITED_NAME = 'Edited before the save'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const STATES = [
  {
    state: 'a newer main file beside a second file',
    store: (ports: TestPorts) =>
      storeNewerMainBesideSecondFile(ports, PROJECT_ID, documentNamed('Second file')),
  },
  {
    state: 'two readable files',
    store: (ports: TestPorts) =>
      storeTwoReadableFiles(ports, PROJECT_ID, { main: 'Main file', second: 'Second file' }),
  },
  {
    state: 'a main file alone',
    store: (ports: TestPorts) => placeDocument(ports, PROJECT_ID, currentBytes()),
  },
]

describe('the files that opening and saving a project remove', () => {
  it.each(STATES)(
    'removes no file but old recovery snapshots of a project with $state',
    async ({ store }) => {
      const ports = createTestPorts()
      await store(ports)
      const removals = vi.spyOn(ports.root, 'removeFile')

      const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
      rename(handle, EDITED_NAME)
      await handle.save()
      await handle.close()

      const removed = removals.mock.calls.map(([path]) => path)
      expect(removed.filter((path) => !path.includes(`${AUTOSAVE_DIRECTORY}/`))).toEqual([])
    },
  )
})
