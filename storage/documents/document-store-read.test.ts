import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../../core'
import type { CodecOptions, DecodedDocument, DecodeFailure, SchemaMigration } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { DocumentDecodeError } from './document-decode-error'
import type { StoreRead } from './document-store'
import {
  BACKUP_DIRECTORY,
  DOCUMENT_PATH,
  backupsOf,
  rootHolding,
  storeOver,
  treeOf,
} from './document-store-test-kit'

const OLDER_VERSION = 8
const STORED_AT = new Date('2026-03-04T05:06:07.000Z')
const NOT_JSON = new TextEncoder().encode('{ not json')

function newerVersionBytes(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
  return bytesOf(document)
}

const throwingStep: SchemaMigration = {
  from: OLDER_VERSION,
  migrate: () => {
    throw new Error('the step broke')
  },
}

function rootStoredAtKnownTime(bytes: Uint8Array): Promise<InMemoryDirectory> {
  return rootHolding(bytes, () => STORED_AT)
}

function valueOf(read: StoreRead): DecodedDocument {
  if (!read.ok) throw new Error(`Expected the read to succeed: ${JSON.stringify(read.failure)}`)
  return read.value
}

function decodeFailureOf(read: StoreRead): DecodeFailure {
  if (read.ok || read.failure.kind !== 'decode') {
    throw new Error(`Expected a decode failure: ${JSON.stringify(read)}`)
  }
  return read.failure.decode
}

function warnedText(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls.map((args) => JSON.stringify(args))
}

describe('reading a stored document through the store', () => {
  it('reads a version 8 document as migrated and keeps its original bytes in one backup', async () => {
    const original = versionFixtureBytes(OLDER_VERSION)
    const root = await rootStoredAtKnownTime(original)
    const store = storeOver(root)

    const value = valueOf(await store.read('a'))

    expect(value.migratedFrom).toBe(OLDER_VERSION)
    expect(value.project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.bytes).toEqual(original)
  })

  it('adds no second backup when the same migrated document is read again', async () => {
    const root = await rootStoredAtKnownTime(versionFixtureBytes(OLDER_VERSION))
    const store = storeOver(root)
    await store.read('a')
    const [first] = await backupsOf(root)

    await store.read('a')

    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.name).toBe(first?.name)
  })

  it('reads a current document as not migrated, writes no backup, and reports when the file last changed', async () => {
    const root = await rootStoredAtKnownTime(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
    const store = storeOver(root)

    const read = await store.read('a')

    expect(valueOf(read).migratedFrom).toBeUndefined()
    expect(await root.list(BACKUP_DIRECTORY)).toEqual([])
    expect(read.ok && read.lastChangedAt).toBe(await root.modifiedAt(DOCUMENT_PATH))
    expect(read.ok && read.lastChangedAt).toBe(STORED_AT.toISOString())
  })

  it('reports a project that is not stored as not found', async () => {
    const store = storeOver(new InMemoryDirectory())

    expect(await store.read('a')).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })
})

describe('a read that fails', () => {
  const cases: { name: string; bytes: Uint8Array; options?: CodecOptions; kind: string }[] = [
    { name: 'bytes that are not JSON', bytes: NOT_JSON, kind: 'not-json' },
    {
      name: 'a document saved at a newer schema version',
      bytes: newerVersionBytes(),
      kind: 'newer-version',
    },
    {
      name: 'a migration that throws',
      bytes: versionFixtureBytes(OLDER_VERSION),
      options: { migration: { schemaMigrations: [throwingStep] } },
      kind: 'migration-failed',
    },
  ]

  it.each(cases)(
    'reports the decode failure for $name and writes nothing',
    async ({ bytes, options, kind }) => {
      const root = await rootStoredAtKnownTime(bytes)
      const before = await treeOf(root)
      const decoded = decodeDocument(bytes, options)
      if (decoded.ok) throw new Error('Expected the codec to fail on these bytes')

      const read = await storeOver(root, options).read('a')

      expect(read).toEqual({ ok: false, failure: { kind: 'decode', decode: decoded.failure } })
      expect(decoded.failure.kind).toBe(kind)
      expect(await treeOf(root)).toEqual(before)
    },
  )
})

describe('a document that breaks the format rules', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([CURRENT_SCHEMA_VERSION, OLDER_VERSION])(
    'is refused by read at version %i with its faults, and nothing is written',
    async (version) => {
      const root = await rootStoredAtKnownTime(
        bytesOf(withUnknownWallField(fixtureDocument(version))),
      )
      const before = await treeOf(root)

      const failure = decodeFailureOf(await storeOver(root).read('a'))

      expect(failure.kind).toBe('format-rules')
      const faultPaths = failure.kind === 'format-rules' ? failure.faults.map((f) => f.path) : []
      expect(faultPaths).toContain(UNKNOWN_WALL_FIELD_PATH)
      expect(await treeOf(root)).toEqual(before)
    },
  )

  it('is opened by load as its migrated document, with a warning that names the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = await rootStoredAtKnownTime(
      bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION))),
    )

    const project = await storeOver(root).load('a')

    expect(project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(warnedText(warn).some((text) => text.includes(UNKNOWN_WALL_FIELD_PATH))).toBe(true)
  })

  it('has its original bytes in a migration backup by the time load resolves', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const original = bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION)))
    const root = await rootStoredAtKnownTime(original)

    await storeOver(root).load('a')

    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.bytes).toEqual(original)
  })

  it('is opened by load at the current version with no backup, because nothing was migrated', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = await rootStoredAtKnownTime(
      bytesOf(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))),
    )

    await storeOver(root).load('a')

    expect(await root.list(BACKUP_DIRECTORY)).toEqual([])
  })
})

describe('load of bytes that cannot be read at all', () => {
  it('rejects with the decode failure and writes nothing', async () => {
    const root = await rootStoredAtKnownTime(NOT_JSON)
    const before = await treeOf(root)

    const error = await storeOver(root)
      .load('a')
      .then(
        () => undefined,
        (rejected: unknown) => rejected,
      )

    expect(error).toBeInstanceOf(DocumentDecodeError)
    expect((error as DocumentDecodeError).failure.kind).toBe('not-json')
    expect(await treeOf(root)).toEqual(before)
  })
})
