import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentBytes,
  faultyProject,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderFiles } from '../project-files/folder-files'
import { DocumentStore } from './document-store'
import {
  DOCUMENT_PATH,
  PassThroughDirectory,
  readProject,
  rootHolding,
  storeOver,
} from './document-store-test-kit'

const FIRST_STORED_AT = new Date('2026-03-04T05:06:07.000Z')
const SAVED_AT = new Date('2026-03-05T06:07:08.000Z')
const FOLDER_DOCUMENT = 'vernacular.json'
const FOLDER_PROJECT_ID = 'p'
const NEW_NAME = 'Saved under a new name'
const NOT_JSON = new TextEncoder().encode('{ not json')

/** Test support: a directory whose lookup of the time of change always rejects. */
class DirectoryThatCannotTellTime extends PassThroughDirectory {
  override modifiedAt(): Promise<string | undefined> {
    return Promise.reject(new Error('the time of change is not available'))
  }
}

/** Test support: a directory whose lookup of the time of change resolves to nothing. */
class DirectoryWithNoTimeToTell extends PassThroughDirectory {
  override modifiedAt(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }
}

/** Test support: a directory whose lookup of the time of change throws before it returns a promise. */
class DirectoryWhoseLookupThrows extends PassThroughDirectory {
  override modifiedAt(): Promise<string | undefined> {
    throw new Error('the lookup of the time of change broke at once')
  }
}

/** A clock that tests move: every write of the directory that it drives is stamped with it. */
function movableClock(start: Date): { now: () => Date; moveTo: (time: Date) => void } {
  let time = start
  return {
    now: () => time,
    moveTo: (next) => {
      time = next
    },
  }
}

describe('the time of last change that a save reports', () => {
  it('a save reports the time of the last change that a listing then gives', async () => {
    const clock = movableClock(FIRST_STORED_AT)
    const store = storeOver(await rootHolding(currentBytes(), clock.now))
    clock.moveTo(SAVED_AT)

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: report.lastChangedAt }])
  })

  it('a read after the save gives the same time', async () => {
    const clock = movableClock(FIRST_STORED_AT)
    const store = storeOver(await rootHolding(currentBytes(), clock.now))
    clock.moveTo(SAVED_AT)

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    const read = await store.read('a')
    expect(read.ok && read.lastChangedAt).toBe(SAVED_AT.toISOString())
    expect(read.ok && read.lastChangedAt).toBe(report.lastChangedAt)
  })

  it("a folder store reports the time of the folder's document", async () => {
    const clock = movableClock(FIRST_STORED_AT)
    const folder = new InMemoryDirectory({ now: clock.now })
    await folder.writeFile(FOLDER_DOCUMENT, currentBytes())
    const files = new FolderFiles(FOLDER_PROJECT_ID, folder, { durable: true })
    clock.moveTo(SAVED_AT)

    const report = await new DocumentStore(files).save(FOLDER_PROJECT_ID, soundProject())

    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
    expect(report.lastChangedAt).toBe(await folder.modifiedAt(FOLDER_DOCUMENT))
  })

  it('a store that cannot tell the time still saves, and reports none', async () => {
    const root = await rootHolding(currentBytes())
    const store = storeOver(new DirectoryThatCannotTellTime(root))

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    expect(report.lastChangedAt).toBeUndefined()
    expect(report).not.toHaveProperty('lastChangedAt')
    expect((await readProject(storeOver(root), 'a')).meta.name).toBe(NEW_NAME)
    expect(await root.modifiedAt(DOCUMENT_PATH)).toBeDefined()
  })
})

describe('the time of last change beside the other members of the report', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a lookup that resolves to nothing still saves, and reports no time', async () => {
    const root = await rootHolding(currentBytes())
    const store = storeOver(new DirectoryWithNoTimeToTell(root))

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    expect(report).not.toHaveProperty('lastChangedAt')
    expect((await readProject(storeOver(root), 'a')).meta.name).toBe(NEW_NAME)
  })

  it('a lookup that throws at once still saves, and reports no time', async () => {
    const root = await rootHolding(currentBytes())
    const store = storeOver(new DirectoryWhoseLookupThrows(root))

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    expect(report).not.toHaveProperty('lastChangedAt')
    expect((await readProject(storeOver(root), 'a')).meta.name).toBe(NEW_NAME)
  })

  it('the first save of a project with no stored file reports the time of that write', async () => {
    const clock = movableClock(SAVED_AT)
    const store = storeOver(await rootHolding(undefined, clock.now))

    const report = await store.save('a', soundProject())

    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: SAVED_AT.toISOString() }])
  })

  it('a save that drops the graft reports the time, and keeps its other members', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const clock = movableClock(SAVED_AT)
    const store = storeOver(await rootHolding(NOT_JSON, clock.now))

    const report = await store.save('a', soundProject())

    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
    expect(report.graftDropped).toBeDefined()
    expect(report.faults).toEqual([])
    expect(report.backedUp).toBe(false)
  })

  it('a save that makes a backup reports the time', async () => {
    const clock = movableClock(SAVED_AT)
    const store = storeOver(await rootHolding(currentBytes(), clock.now))

    const report = await store.save('a', faultyProject())

    expect(report.backedUp).toBe(true)
    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
  })

  it('a lookup that rejects changes no other member of a plain save report', async () => {
    const root = await rootHolding(currentBytes())
    const store = storeOver(new DirectoryThatCannotTellTime(root))

    const report = await store.save('a', renamed(soundProject(), NEW_NAME))

    expect(report).toEqual({ faults: [], backedUp: false })
  })
})
