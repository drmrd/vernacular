import { describe, expect, it } from 'vitest'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { IndexedDbDirectory } from './indexeddb-directory'
import { convertLegacyRecords } from './legacy-records'
import {
  CURRENT_PROJECT_PATH,
  currentProject,
  directoryWithoutConversion,
  fileRecordAt,
  fileRecordsOf,
  legacyIdsOf,
  jsonBytesOf,
  putFileRecord,
  registerDatabaseCleanup,
  seededDatabase,
  storedFileBytesOf,
  storedFilePathsOf,
  workspaceOver,
} from './legacy-records-test-kit'

registerDatabaseCleanup()

const EARLIER_SAVE_TIME = '2020-01-02T03:04:05.000Z'
const OTHER_TABS_BYTES = Uint8Array.of(4, 5, 6)

/** The project of the current fixture, with its first floor's elevation set to `elevation`. */
function projectWithElevation(elevation: number): Json {
  const project = currentProject()
  const floors = project.floors as { elevation: number }[]
  const first = floors[0]
  if (first === undefined) throw new Error('The fixture has no floor')
  first.elevation = elevation
  return project
}

/** The stored paths under the directory of `id`. */
async function pathsUnder(name: string, id: string): Promise<string[]> {
  return (await storedFilePathsOf(name)).filter((path) => path.startsWith(`${id}/`))
}

describe('a record that cannot be converted', () => {
  it('does not stop the other records and does not lock the storage', async () => {
    const cyclic: Record<string, unknown> = { name: 'a project that refers to itself' }
    cyclic.self = cyclic
    const name = await seededDatabase(
      { id: 'cyclic', project: cyclic },
      { id: 'current', project: currentProject() },
    )
    const directory = new IndexedDbDirectory(name)

    await expect(directory.list('')).resolves.toEqual(['current', 'cyclic'])

    expect(await storedFilePathsOf(name)).toEqual([CURRENT_PROJECT_PATH])
    expect(await legacyIdsOf(name)).toEqual(['cyclic'])
    expect(await workspaceOver(directory).ids()).toEqual(['current', 'cyclic'])
    await expect(directory.readFile('cyclic/vernacular.json')).rejects.toThrow(/json/i)
  })
})

describe('a record whose object does not survive JSON unchanged', () => {
  it('is not converted when it has no project, and is not listed', async () => {
    const name = await seededDatabase({ id: 'bare' })
    const directory = new IndexedDbDirectory(name)

    await directory.list('')

    expect(await pathsUnder(name, 'bare')).toEqual([])
    expect(await legacyIdsOf(name)).toEqual(['bare'])
    expect(await workspaceOver(directory).ids()).toEqual([])
  })

  it('is not converted when a number in it is not finite, and is still listed', async () => {
    const name = await seededDatabase({ id: 'current', project: projectWithElevation(Number.NaN) })
    const directory = new IndexedDbDirectory(name)

    await directory.list('')

    expect(await storedFilePathsOf(name)).toEqual([])
    expect(await legacyIdsOf(name)).toEqual(['current'])
    expect(await workspaceOver(directory).ids()).toEqual(['current'])
    expect(await directory.readFile(CURRENT_PROJECT_PATH)).toBeInstanceOf(Uint8Array)
  })

  it('is converted when only a property with the value undefined differs', async () => {
    const project = { ...currentProject(), note: undefined }
    const name = await seededDatabase({ id: 'current', project })

    await new IndexedDbDirectory(name).list('')

    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(jsonBytesOf(project))
    expect(await legacyIdsOf(name)).toEqual([])
  })
})

describe('a conversion that meets a file it did not write', () => {
  it('leaves the bytes of another tab in place when its read-back mismatches', async () => {
    const name = await seededDatabase({ id: 'current', project: currentProject() })
    const readBack = async (): Promise<Uint8Array> => {
      await putFileRecord(name, {
        path: CURRENT_PROJECT_PATH,
        bytes: OTHER_TABS_BYTES,
        modifiedAt: EARLIER_SAVE_TIME,
      })
      return OTHER_TABS_BYTES
    }
    const directory = new IndexedDbDirectory(name, {
      convertLegacy: (database) => convertLegacyRecords(database, { readBack }),
    })

    await directory.list('')

    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(OTHER_TABS_BYTES)
    expect(await legacyIdsOf(name)).toEqual(['current'])
    expect(await fileRecordAt(name, CURRENT_PROJECT_PATH)).not.toHaveProperty('convertedBy')
  })

  it('removes the record and keeps the file when an earlier conversion wrote the same bytes', async () => {
    const project = currentProject()
    const name = await seededDatabase({ id: 'current', project })
    await directoryWithoutConversion(name).list('')
    await putFileRecord(name, {
      path: CURRENT_PROJECT_PATH,
      bytes: jsonBytesOf(project),
      modifiedAt: EARLIER_SAVE_TIME,
    })

    await new IndexedDbDirectory(name).list('')

    expect(await legacyIdsOf(name)).toEqual([])
    const files = await fileRecordsOf(name)
    expect(files).toHaveLength(1)
    expect(new Uint8Array(files?.[0]?.bytes ?? new Uint8Array())).toEqual(jsonBytesOf(project))
    expect(files?.[0]?.modifiedAt).toBe(EARLIER_SAVE_TIME)
  })
})

describe('a record whose id cannot be a project directory', () => {
  it.each(['', 'assets', 'a/b', 7])(
    'is not converted, listed, or served, while a valid record converts (id %j)',
    async (id) => {
      const name = await seededDatabase(
        { id, project: currentProject() },
        { id: 'current', project: currentProject() },
      )
      const directory = new IndexedDbDirectory(name)

      await directory.list('')

      expect(await storedFilePathsOf(name)).toEqual([CURRENT_PROJECT_PATH])
      expect(await legacyIdsOf(name)).toContain(id)
      expect(await legacyIdsOf(name)).not.toContain('current')
      expect(await workspaceOver(directory).ids()).toEqual(['current'])
    },
  )
})
