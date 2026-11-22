import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import {
  currentBytes,
  faultyProject,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderFiles } from '../project-files/folder-files'
import { DocumentStore } from './document-store'
import {
  DOCUMENT_PATH,
  PassThroughDirectory,
  SECOND_FILE_PATH,
  newerVersionBytes,
  readProject,
  rootHolding,
  storeOver,
} from './document-store-test-kit'

const FIRST_STORED_AT = new Date('2026-03-04T05:06:07.000Z')
const SAVED_AT = new Date('2026-03-05T06:07:08.000Z')
const FOLDER_DOCUMENT = 'vernacular.json'
const FOLDER_PROJECT_ID = 'p'
const NEW_NAME = 'Saved under a new name'
const NEWER_SECOND_FILE_PATH = `a/vernacular.format-${CURRENT_SCHEMA_VERSION + 1}.json`
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

/** Test support: a directory whose lookup of the time of change rejects for one path only. */
class DirectoryThatCannotTellTimeOf extends PassThroughDirectory {
  constructor(
    inner: DirectoryPort,
    private readonly path: string,
  ) {
    super(inner)
  }

  override modifiedAt(path: string): Promise<string | undefined> {
    if (path !== this.path) return super.modifiedAt(path)
    return Promise.reject(new Error('the time of change is not available'))
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

/** A root whose files are written in turn: the first at FIRST_STORED_AT, the later ones at SAVED_AT. */
async function rootWrittenInTurn(...writes: [string, Uint8Array][]): Promise<InMemoryDirectory> {
  const clock = movableClock(FIRST_STORED_AT)
  const root = new InMemoryDirectory({ now: clock.now })
  for (const [path, bytes] of writes) {
    await root.writeFile(path, bytes)
    clock.moveTo(SAVED_AT)
  }
  return root
}

describe('the time of last change of a project with a second file', () => {
  it('is the time of the second file when it changed last, in the listing and the read', async () => {
    const root = await rootWrittenInTurn(
      [DOCUMENT_PATH, newerVersionBytes()],
      [SECOND_FILE_PATH, currentBytes()],
    )
    const store = storeOver(root)

    const read = await store.read('a')

    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: SAVED_AT.toISOString() }])
    expect(read.ok && read.lastChangedAt).toBe(SAVED_AT.toISOString())
  })

  it('is the time of the main file when it changed last, in the listing and the read', async () => {
    const root = await rootWrittenInTurn(
      [SECOND_FILE_PATH, currentBytes()],
      [DOCUMENT_PATH, currentBytes()],
    )
    const store = storeOver(root)

    const read = await store.read('a')

    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: SAVED_AT.toISOString() }])
    expect(read.ok && read.lastChangedAt).toBe(SAVED_AT.toISOString())
  })

  it('counts a second file above the build version', async () => {
    const root = await rootWrittenInTurn(
      [DOCUMENT_PATH, currentBytes()],
      [NEWER_SECOND_FILE_PATH, newerVersionBytes()],
    )

    expect(await storeOver(root).list()).toEqual([
      { id: 'a', lastChangedAt: SAVED_AT.toISOString() },
    ])
  })

  it('is unknown when the time of one of the files cannot be read', async () => {
    const root = await rootWrittenInTurn(
      [DOCUMENT_PATH, currentBytes()],
      [SECOND_FILE_PATH, currentBytes()],
    )
    const store = storeOver(new DirectoryThatCannotTellTimeOf(root, SECOND_FILE_PATH))

    const read = await store.read('a')

    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: undefined }])
    expect(read.ok).toBe(true)
    expect(read).not.toHaveProperty('lastChangedAt')
  })
})

describe('the time of last change after a save beside a newer main file', () => {
  it('is the time of that save in the report of the save', async () => {
    const clock = movableClock(FIRST_STORED_AT)
    const store = storeOver(await rootHolding(newerVersionBytes(), clock.now))
    clock.moveTo(SAVED_AT)

    const report = await store.save('a', soundProject())

    expect(report.lastChangedAt).toBe(SAVED_AT.toISOString())
  })

  it('is the time of that save in the listing and the read, not the time of the main file', async () => {
    const clock = movableClock(FIRST_STORED_AT)
    const store = storeOver(await rootHolding(newerVersionBytes(), clock.now))
    clock.moveTo(SAVED_AT)
    await store.save('a', soundProject())

    const read = await store.read('a')

    expect(await store.list()).toEqual([{ id: 'a', lastChangedAt: SAVED_AT.toISOString() }])
    expect(read.ok && read.lastChangedAt).toBe(SAVED_AT.toISOString())
  })
})
