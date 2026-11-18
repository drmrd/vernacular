import { describe, expect, it } from 'vitest'
import { IndexedDbDirectory } from './indexeddb-directory'
import {
  CURRENT_PROJECT_PATH,
  currentProject,
  deleteLegacyRecord,
  deleteStoredFile,
  directoryReadingBackWith,
  directoryWithoutConversion,
  fileRecordAt,
  legacyIdsOf,
  jsonBytesOf,
  putFileRecord,
  registerDatabaseCleanup,
  replaceStoredBytes,
  seededDatabase,
  storedFileBytesOf,
  storeOver,
  storedFilePathsOf,
  workspaceOver,
} from './legacy-records-test-kit'

registerDatabaseCleanup()

const EARLIER_SAVE_TIME = '2020-01-02T03:04:05.000Z'
const WRONG_BYTES = Uint8Array.of(9, 9, 9)
const SAVED_BYTES = Uint8Array.of(1, 2, 3)

describe('a converted file that does not read back right', () => {
  it('gives way to its record when the stored bytes are wrong', async () => {
    const name = await seededDatabase({ id: 'current', project: currentProject() })
    const readBack = async (path: string): Promise<Uint8Array> => {
      await replaceStoredBytes(name, path, WRONG_BYTES)
      return WRONG_BYTES
    }
    const directory = directoryReadingBackWith(name, readBack)

    const read = await storeOver(directory).read('current')

    expect(await storedFilePathsOf(name)).toEqual([])
    expect(await legacyIdsOf(name)).toEqual(['current'])
    expect(read.ok).toBe(true)
  })

  it('gives way at the next open when a crash left it with the token of its conversion', async () => {
    const project = currentProject()
    const name = await seededDatabase({ id: 'current', project })
    await directoryWithoutConversion(name).list('')
    await putFileRecord(name, {
      path: CURRENT_PROJECT_PATH,
      bytes: WRONG_BYTES,
      modifiedAt: EARLIER_SAVE_TIME,
      convertedBy: 'left-by-a-crash',
    })

    await new IndexedDbDirectory(name).list('')
    await new IndexedDbDirectory(name).list('')

    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(jsonBytesOf(project))
    expect(await legacyIdsOf(name)).toEqual([])
  })
})

describe('the token of a conversion', () => {
  it('marks the converted file and is gone after a save', async () => {
    const name = await seededDatabase({ id: 'current', project: currentProject() })
    const directory = new IndexedDbDirectory(name)
    await directory.list('')
    const converted = await fileRecordAt(name, CURRENT_PROJECT_PATH)
    expect(typeof converted?.convertedBy).toBe('string')

    await directory.writeFile(CURRENT_PROJECT_PATH, SAVED_BYTES)

    const saved = await fileRecordAt(name, CURRENT_PROJECT_PATH)
    expect(saved).not.toHaveProperty('convertedBy')
    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(SAVED_BYTES)
  })
})

describe('a conversion that meets trouble while it reads back', () => {
  it('converts the other records when the read-back of one throws, and the next open finishes', async () => {
    const first = currentProject()
    const name = await seededDatabase(
      { id: 'a-one', project: first },
      { id: 'b-two', project: currentProject() },
    )
    const readBack = (path: string): Promise<Uint8Array | undefined> =>
      path.startsWith('a-one/')
        ? Promise.reject(new Error('the read-back broke'))
        : Promise.resolve(storedFileBytesOf(name, path))
    const directory = directoryReadingBackWith(name, readBack)

    await expect(directory.list('')).resolves.toEqual(['a-one', 'b-two'])

    expect(await storedFilePathsOf(name)).toContain('b-two/vernacular.json')
    expect(await legacyIdsOf(name)).toEqual(['a-one'])
    await new IndexedDbDirectory(name).list('')
    expect(await legacyIdsOf(name)).toEqual([])
    expect(await storedFileBytesOf(name, 'a-one/vernacular.json')).toEqual(jsonBytesOf(first))
  })

  it('keeps the record when its file vanished during the read-back', async () => {
    const project = currentProject()
    const name = await seededDatabase({ id: 'current', project })
    const readBack = async (path: string): Promise<Uint8Array> => {
      await deleteStoredFile(name, path)
      return jsonBytesOf(project)
    }
    const directory = directoryReadingBackWith(name, readBack)

    const read = await storeOver(directory).read('current')

    expect(await legacyIdsOf(name)).toEqual(['current'])
    expect(read.ok).toBe(true)
  })

  it('does not bring back a project that another tab removed during the read-back', async () => {
    const project = currentProject()
    const name = await seededDatabase({ id: 'current', project })
    const otherTab = directoryWithoutConversion(name)
    const readBack = async (): Promise<Uint8Array> => {
      await otherTab.removeTree('current')
      return jsonBytesOf(project)
    }
    const directory = directoryReadingBackWith(name, readBack)

    await directory.list('')

    expect(await storedFilePathsOf(name)).toEqual([])
    expect(await legacyIdsOf(name)).toEqual([])
    expect(await workspaceOver(directory).ids()).toEqual([])
  })

  it('keeps the converted file when its record is already gone at a mismatch', async () => {
    const project = currentProject()
    const name = await seededDatabase({ id: 'current', project })
    const readBack = async (): Promise<Uint8Array> => {
      await deleteLegacyRecord(name, 'current')
      return WRONG_BYTES
    }
    const directory = directoryReadingBackWith(name, readBack)

    const read = await storeOver(directory).read('current')

    expect(await storedFileBytesOf(name, CURRENT_PROJECT_PATH)).toEqual(jsonBytesOf(project))
    expect(await legacyIdsOf(name)).toEqual([])
    expect(read.ok).toBe(true)
  })
})
