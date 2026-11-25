import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  currentBytes,
  decodedOf,
  failureOf,
} from '../../tests/storage/conformance/conformance-documents'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { PROJECT_FILE, secondDocumentFileName } from '../project-files/project-file-name'
import {
  BackupRefusingDirectory,
  ChangeLoggingDirectory,
  DISK_FULL_MESSAGE,
  DOCUMENT_PATH,
  NEWER_SECOND_FILE_PATH,
  NOT_JSON,
  SECOND_FILE_NAME,
  SECOND_FILE_PATH,
  SECOND_FILE_PROJECT_NAME,
  anotherNewerMainFile,
  backupNameOf,
  backupsOf,
  choiceOfTwoFiles,
  digestOf,
  newerVersionBytes,
  rejectionOf,
  rootHolding,
  rootHoldingFiles,
  soundSecondFile,
  storeOver,
  treeOf,
  twoFilesOrThrow,
} from './document-store-test-kit'
import type { TwoDocumentFiles } from './second-file'

const OLDER_VERSION = 8
const NEWER_VERSION = CURRENT_SCHEMA_VERSION + 1
const OLDER_SECOND_FILE_NAME = secondDocumentFileName(OLDER_VERSION)
const OLDER_SECOND_FILE_PATH = `a/${OLDER_SECOND_FILE_NAME}`
const MAIN_TIME = new Date('2026-03-01T09:00:00.000Z')
const SECOND_TIME = new Date('2026-03-05T17:30:00.000Z')

const CHOICES = ['setAsideSecondFile', 'promoteSecondFile'] as const

describe('the two document files of a project', () => {
  it('gives the state, and the name, the time, and the digest of each file, beside a newer main file', async () => {
    const main = newerVersionBytes()
    const second = soundSecondFile()
    let now = MAIN_TIME
    const root = new InMemoryDirectory({ now: () => now })
    await root.writeFile(DOCUMENT_PATH, main)
    now = SECOND_TIME
    await root.writeFile(SECOND_FILE_PATH, second)
    const logged = new ChangeLoggingDirectory(root)

    const files = await storeOver(logged).twoFiles('a')

    expect(files).toEqual({
      state: 'newer-main',
      main: {
        name: PROJECT_FILE,
        changedAt: MAIN_TIME.toISOString(),
        digest: await digestOf(main),
      },
      second: {
        name: SECOND_FILE_NAME,
        changedAt: SECOND_TIME.toISOString(),
        digest: await digestOf(second),
      },
    })
    expect(logged.calls).toEqual([])
  })

  it('gives the state both-readable beside a main file that this build reads', async () => {
    const root = await rootHoldingFiles({ main: currentBytes(), second: soundSecondFile() })

    const files = await storeOver(root).twoFiles('a')

    expect(files?.state).toBe('both-readable')
    expect(files?.main.name).toBe(PROJECT_FILE)
    expect(files?.second.name).toBe(SECOND_FILE_NAME)
  })

  it.each([
    { name: 'no second file', files: { main: currentBytes() } },
    {
      name: 'a second file above the build only',
      files: { main: currentBytes(), aboveBuild: newerVersionBytes() },
    },
    { name: 'no main file', files: { second: soundSecondFile() } },
    {
      name: 'a main file that is not JSON',
      files: { main: NOT_JSON, second: soundSecondFile() },
    },
  ])('gives nothing, and writes nothing, for a project with $name', async (c) => {
    const root = await rootHoldingFiles(c.files)
    const before = await treeOf(root)

    const files = await storeOver(root).twoFiles('a')

    expect(files).toBeUndefined()
    expect(await treeOf(root)).toEqual(before)
  })

  it('takes the second file of the highest version at or below the build version', async () => {
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second })
    await root.writeFile(OLDER_SECOND_FILE_PATH, versionFixtureBytes(OLDER_VERSION))
    await root.writeFile(NEWER_SECOND_FILE_PATH, newerVersionBytes())

    const files = await storeOver(root).twoFiles('a')

    expect(files?.second.name).toBe(SECOND_FILE_NAME)
    expect(files?.second.digest).toBe(await digestOf(second))
  })
})

describe('reading the second document file', () => {
  it('gives the document of the second file, also when the main file is readable', async () => {
    const root = await rootHoldingFiles({ main: currentBytes(), second: soundSecondFile() })

    const read = await storeOver(root).readSecondFile('a')

    expect(decodedOf(read).project.meta.name).toBe(SECOND_FILE_PROJECT_NAME)
  })

  it('gives the decode failure of a second file that is not JSON', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: NOT_JSON })

    const read = await storeOver(root).readSecondFile('a')

    expect(failureOf(read)).toMatchObject({ kind: 'decode', decode: { kind: 'not-json' } })
  })

  it('does not find a second file when the project has none', async () => {
    const root = await rootHolding(newerVersionBytes())

    const read = await storeOver(root).readSecondFile('a')

    expect(read).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })
})

describe('setting the second document file aside', () => {
  it('keeps a copy of the second file, removes it, and leaves the main file as it was', async () => {
    const main = newerVersionBytes()
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main, second })
    const store = storeOver(root)

    const change = await store.setAsideSecondFile('a', await twoFilesOrThrow(store))

    expect(change).toEqual({ ok: true })
    expect(await root.readFile(SECOND_FILE_PATH)).toBeUndefined()
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(main)
    expect(await backupsOf(root)).toEqual([
      {
        name: await backupNameOf('set-aside-second-file', CURRENT_SCHEMA_VERSION, second),
        bytes: second,
      },
    ])
  })

  it('moves every second file at or below the build version and leaves one above it', async () => {
    const second = soundSecondFile()
    const older = versionFixtureBytes(OLDER_VERSION)
    const above = newerVersionBytes()
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second })
    await root.writeFile(OLDER_SECOND_FILE_PATH, older)
    await root.writeFile(NEWER_SECOND_FILE_PATH, above)
    const store = storeOver(root)

    await store.setAsideSecondFile('a', await twoFilesOrThrow(store))

    expect(await root.readFile(SECOND_FILE_PATH)).toBeUndefined()
    expect(await root.readFile(OLDER_SECOND_FILE_PATH)).toBeUndefined()
    expect(await root.readFile(NEWER_SECOND_FILE_PATH)).toEqual(above)
    const names = (await backupsOf(root)).map(({ name }) => name)
    expect(names).toHaveLength(2)
    expect(names).toContain(
      await backupNameOf('set-aside-second-file', CURRENT_SCHEMA_VERSION, second),
    )
    expect(names).toContain(await backupNameOf('set-aside-second-file', OLDER_VERSION, older))
  })
})

describe('promoting the second document file', () => {
  it.each([
    { state: 'a newer main file', main: newerVersionBytes(), version: NEWER_VERSION },
    { state: 'a readable main file', main: currentBytes(), version: CURRENT_SCHEMA_VERSION },
  ])(
    'keeps a copy of $state, makes the second file the main file, and moves the second files',
    async ({ main, version }) => {
      const second = soundSecondFile()
      const older = versionFixtureBytes(OLDER_VERSION)
      const root = await rootHoldingFiles({ main, second })
      await root.writeFile(OLDER_SECOND_FILE_PATH, older)
      const store = storeOver(root)

      const change = await store.promoteSecondFile('a', await twoFilesOrThrow(store))

      expect(change).toEqual({ ok: true })
      expect(await root.readFile(DOCUMENT_PATH)).toEqual(second)
      expect(await root.readFile(SECOND_FILE_PATH)).toBeUndefined()
      expect(await root.readFile(OLDER_SECOND_FILE_PATH)).toBeUndefined()
      const copies = await backupsOf(root)
      const replaced = await backupNameOf('replaced-by-second-file', version, main)
      expect(copies.find(({ name }) => name === replaced)?.bytes).toEqual(main)
      const setAside = await backupNameOf('set-aside-second-file', CURRENT_SCHEMA_VERSION, second)
      expect(copies.find(({ name }) => name === setAside)?.bytes).toEqual(second)
      expect(copies).toHaveLength(3)
      const read = await store.read('a')
      expect(decodedOf(read).project.meta.name).toBe(SECOND_FILE_PROJECT_NAME)
      expect(read).not.toHaveProperty('secondFile')
    },
  )

  it('refuses a second file that is not JSON, and writes and removes nothing', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: NOT_JSON })
    const logged = new ChangeLoggingDirectory(root)
    const store = storeOver(logged)
    const before = await treeOf(root)

    const change = await store.promoteSecondFile('a', await twoFilesOrThrow(store))

    expect(change).toMatchObject({
      ok: false,
      refusal: { kind: 'second-file-unreadable', decode: { kind: 'not-json' } },
    })
    expect(logged.calls).toEqual([])
    expect(await treeOf(root)).toEqual(before)
  })
})

describe.each(CHOICES)('%s when the files are not as the choice saw them', (choice) => {
  it.each([
    {
      change: 'the bytes of the main file changed',
      alter: async (root: InMemoryDirectory, files: TwoDocumentFiles) => {
        await root.writeFile(DOCUMENT_PATH, anotherNewerMainFile())
        return files
      },
    },
    {
      change: 'the bytes of the second file changed',
      alter: async (root: InMemoryDirectory, files: TwoDocumentFiles) => {
        await root.writeFile(SECOND_FILE_PATH, soundSecondFile('Changed since'))
        return files
      },
    },
    {
      change: 'the state is another',
      alter: (_root: InMemoryDirectory, files: TwoDocumentFiles) =>
        Promise.resolve({ ...files, state: 'both-readable' as const }),
    },
    {
      change: 'the main file has another name',
      alter: (_root: InMemoryDirectory, files: TwoDocumentFiles) =>
        Promise.resolve({ ...files, main: { ...files.main, name: 'vernacular.copy.json' } }),
    },
    {
      change: 'the second file is another one',
      alter: (_root: InMemoryDirectory, files: TwoDocumentFiles) =>
        Promise.resolve({ ...files, second: { ...files.second, name: OLDER_SECOND_FILE_NAME } }),
    },
  ])('refuses and writes and removes nothing when $change', async ({ alter }) => {
    const { root, logged, store, files } = await choiceOfTwoFiles()
    const expected = await alter(root, files)
    const before = await treeOf(root)

    const change = await store[choice]('a', expected)

    expect(change).toEqual({ ok: false, refusal: { kind: 'files-changed' } })
    expect(logged.calls).toEqual([])
    expect(await treeOf(root)).toEqual(before)
  })

  it('finds no second file when the project has none any more, and writes and removes nothing', async () => {
    const { root, logged, store, files } = await choiceOfTwoFiles()
    await root.removeFile(SECOND_FILE_PATH)
    const before = await treeOf(root)

    const change = await store[choice]('a', files)

    expect(change).toEqual({ ok: false, refusal: { kind: 'no-second-file' } })
    expect(logged.calls).toEqual([])
    expect(await treeOf(root)).toEqual(before)
  })

  it('rejects and removes nothing when no backup can be written', async () => {
    const main = newerVersionBytes()
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main, second })
    const logged = new ChangeLoggingDirectory(root)
    const store = storeOver(new BackupRefusingDirectory(logged))
    const files = await twoFilesOrThrow(store)

    const error = await rejectionOf(() => store[choice]('a', files))

    expect(error).toEqual(new Error(DISK_FULL_MESSAGE))
    expect(logged.removals).toEqual([])
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(main)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(second)
  })
})
