import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidProjectId } from '../../storage'
import { soundProject } from '../../tests/storage/conformance/conformance-documents'
import { IN_FOLDER, IN_WORKSPACE } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import {
  NEW_PROJECT_ID_PATTERN,
  folderRecord,
  idsOf,
  placeSound,
  rebuildPorts,
  soundRecordOf,
} from '../projects/rebuild-test-kit'
import { startProject } from './start'

const FOLDER_ID = 'in-a-folder'

/** Times of use, from the oldest to the latest. */
const LONG_AGO = '2026-09-01T10:00:00.000Z'
const EARLIER_USE = '2026-10-10T10:00:00.000Z'
const LATEST_USE = '2026-10-20T10:00:00.000Z'

/** What the caller of the start gives to build a project that is not stored yet. */
const create = () => soundProject()

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Ports whose store holds a sound project under each id and whose index holds a record of each. */
async function portsWithRecords(uses: Readonly<Record<string, string>>): Promise<TestPorts> {
  const ports = rebuildPorts()
  await placeSound(ports, Object.keys(uses))
  for (const [id, lastUsedAt] of Object.entries(uses)) {
    await ports.index.put(soundRecordOf(id, { lastUsedAt }))
  }
  return ports
}

describe('the request that the bare address opens', () => {
  it('gives the project of the latest record', async () => {
    const ports = await portsWithRecords({
      older: EARLIER_USE,
      newer: LATEST_USE,
      oldest: LONG_AGO,
    })

    const request = await startProject(ports, create)

    expect(request).toEqual({ id: 'newer', location: IN_WORKSPACE, create })
  })

  it('gives a new project under a new id when the index holds no record', async () => {
    const ports = rebuildPorts()

    const request = await startProject(ports, create)

    expect(request).toEqual({ id: request.id, location: IN_WORKSPACE, create })
    expect(request.id).toMatch(NEW_PROJECT_ID_PATTERN)
    expect(isValidProjectId(request.id)).toBe(true)
  })

  it('gives another new id at each start of an empty browser', async () => {
    const ports = rebuildPorts()

    const first = await startProject(ports, create)
    const second = await startProject(ports, create)

    expect(second.id).not.toBe(first.id)
  })

  it('starts in the project named current when the store holds only that project and no index, and then the index has its record', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['current'])
    expect(await ports.index.all()).toEqual([])

    const request = await startProject(ports, create)

    expect(request).toEqual({ id: 'current', location: IN_WORKSPACE, create })
    expect(await ports.index.all()).toEqual([soundRecordOf('current')])
  })

  it('gives a folder project that was used last, with nothing to create', async () => {
    const ports = await portsWithRecords({ browser: EARLIER_USE })
    await ports.index.put(folderRecord(FOLDER_ID, { lastUsedAt: LATEST_USE }))

    const request = await startProject(ports, create)

    expect(request).toStrictEqual({ id: FOLDER_ID, location: IN_FOLDER })
  })

  it('gives the project used last when a folder and a browser project both have records', async () => {
    const ports = await portsWithRecords({ browser: LATEST_USE })
    await ports.index.put(folderRecord(FOLDER_ID, { lastUsedAt: EARLIER_USE }))

    const request = await startProject(ports, create)

    expect(request).toEqual({ id: 'browser', location: IN_WORKSPACE, create })
  })
})

describe('what the start leaves alone', () => {
  it('opens nothing, locks nothing, and stores no document', async () => {
    const stored = await portsWithRecords({ kept: LATEST_USE })
    const empty = rebuildPorts()
    const storedBytes = await stored.root.readFile('kept/vernacular.json')
    const acquire = vi.spyOn(stored.locks, 'tryAcquire')
    const saveToStored = vi.spyOn(stored.workspace, 'save')
    const acquireWhenEmpty = vi.spyOn(empty.locks, 'tryAcquire')
    const saveToEmpty = vi.spyOn(empty.workspace, 'save')

    await startProject(stored, create)
    await startProject(empty, create)

    expect(acquire).not.toHaveBeenCalled()
    expect(acquireWhenEmpty).not.toHaveBeenCalled()
    expect(saveToStored).not.toHaveBeenCalled()
    expect(saveToEmpty).not.toHaveBeenCalled()
    expect([...stored.lockRegistry]).toEqual([])
    expect([...empty.lockRegistry]).toEqual([])
    expect(await stored.root.readFile('kept/vernacular.json')).toEqual(storedBytes)
    expect((await stored.workspace.list()).map((summary) => summary.id)).toEqual(['kept'])
    expect(await empty.workspace.list()).toEqual([])
    expect(idsOf(await empty.index.all())).toEqual([])
  })
})
