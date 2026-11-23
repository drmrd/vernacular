import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { soundProject } from '../../tests/storage/conformance/conformance-documents'
import {
  ChangeLoggingDirectory,
  DISK_FULL_MESSAGE,
  DOCUMENT_PATH,
  SECOND_FILE_PATH,
  SetAsideRefusingDirectory,
  backupNameOf,
  backupsOf,
  newerVersionBytes,
  rejectionOf,
  rootHoldingFiles,
  soundSecondFile,
  storeOver,
  twoFilesOrThrow,
} from './document-store-test-kit'

const NEWER_VERSION = CURRENT_SCHEMA_VERSION + 1
const BACKUP_PATH = 'a/.house-backups'

describe('a promotion that stops after the main file was replaced', () => {
  it('leaves the second file as the main file, keeps a copy of the replaced file, and keeps the second file', async () => {
    const main = newerVersionBytes()
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main, second })
    const store = storeOver(new SetAsideRefusingDirectory(root))

    const error = await rejectionOf(async () =>
      store.promoteSecondFile('a', await twoFilesOrThrow(store)),
    )

    expect(error).toEqual(new Error(DISK_FULL_MESSAGE))
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(second)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(second)
    expect(await backupsOf(root)).toEqual([
      { name: await backupNameOf('replaced-by-second-file', NEWER_VERSION, main), bytes: main },
    ])
  })
})

describe('the order of the changes of a choice', () => {
  it('writes the copy of the second file before it removes the second file', async () => {
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second })
    const logged = new ChangeLoggingDirectory(root)
    const store = storeOver(logged)

    await store.setAsideSecondFile('a', await twoFilesOrThrow(store))

    const setAside = await backupNameOf('set-aside-second-file', CURRENT_SCHEMA_VERSION, second)
    expect(logged.calls).toEqual([`write ${BACKUP_PATH}/${setAside}`, `remove ${SECOND_FILE_PATH}`])
  })

  it('writes the copy of the main file, then the main file, then the copy of the second file, then removes it', async () => {
    const main = newerVersionBytes()
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main, second })
    const logged = new ChangeLoggingDirectory(root)
    const store = storeOver(logged)

    await store.promoteSecondFile('a', await twoFilesOrThrow(store))

    const replaced = await backupNameOf('replaced-by-second-file', NEWER_VERSION, main)
    const setAside = await backupNameOf('set-aside-second-file', CURRENT_SCHEMA_VERSION, second)
    expect(logged.calls).toEqual([
      `write ${BACKUP_PATH}/${replaced}`,
      `write ${DOCUMENT_PATH}`,
      `write ${BACKUP_PATH}/${setAside}`,
      `remove ${SECOND_FILE_PATH}`,
    ])
  })
})

describe('the files that a save, a read, and a listing remove', () => {
  it('removes no file', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: soundSecondFile() })
    const logged = new ChangeLoggingDirectory(root)
    const store = storeOver(logged)

    await store.save('a', soundProject())
    await store.read('a')
    await store.list()

    expect(logged.removals).toEqual([])
  })
})
