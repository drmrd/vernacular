import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createWall, decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, Project, SchemaMigration } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  firstWallOf,
  projectOf,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  BACKUP_DIRECTORY,
  DOCUMENT_PATH,
  backupsOf,
  readProject,
  rootHolding,
  storeOver,
} from './document-store-test-kit'

const OLDER_VERSION = 8
const FAULT_BACKUP_PREFIX = 'last-valid-'
const DIGEST_PATTERN = '[0-9a-f]{64}'
const NOT_JSON = new TextEncoder().encode('{ not json')

const throwingStep: SchemaMigration = {
  from: OLDER_VERSION,
  migrate: () => {
    throw new Error('the step broke')
  },
}

function currentBytes(): Uint8Array {
  return versionFixtureBytes(CURRENT_SCHEMA_VERSION)
}

function validProject(): Project {
  return projectOf(currentBytes())
}

/** A project that breaks the format rules: an unknown field on its first wall. */
function faultyProject(): Project {
  const project = validProject()
  withUnknownWallField(project as unknown as Json)
  return project
}

function storedJson(bytes: Uint8Array | undefined): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('saving a valid project through the store', () => {
  it('writes the document, reports no faults and no backup, and reads back as saved', async () => {
    const root = await rootHolding(undefined)
    const store = storeOver(root)
    const project = validProject()

    const report = await store.save('a', project)

    expect(report).toEqual({ faults: [], backedUp: false, lastChangedAt: expect.any(String) })
    expect(report.graftDropped).toBeUndefined()
    expect(await root.readFile(DOCUMENT_PATH)).toBeDefined()
    const read = await store.read('a')
    const expected = projectOf(encodeDocument(project, undefined).bytes)
    expect(read.ok && read.value.project).toEqual(expected)
    expect(await root.list(BACKUP_DIRECTORY)).toEqual([])
  })
})

describe('saving a project that breaks the format rules', () => {
  it('still writes it, reports the faults, and backs up the last stored file that passed', async () => {
    const stored = currentBytes()
    const root = await rootHolding(stored)

    const report = await storeOver(root).save('a', faultyProject())

    expect(report.backedUp).toBe(true)
    expect(report.faults.map((fault) => fault.path)).toContain(UNKNOWN_WALL_FIELD_PATH)
    expect(firstWallOf(storedJson(await root.readFile(DOCUMENT_PATH)))[UNKNOWN_FIELD]).toBe(1)
    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.name.startsWith(FAULT_BACKUP_PREFIX)).toBe(true)
    expect(backups[0]?.bytes).toEqual(stored)
  })

  it('adds no second backup when the next save is faulty too', async () => {
    const root = await rootHolding(currentBytes())
    const store = storeOver(root)
    await store.save('a', faultyProject())
    const [first] = await backupsOf(root)

    const report = await store.save('a', faultyProject())

    expect(report.backedUp).toBe(false)
    expect(report.faults.length).toBeGreaterThan(0)
    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.name).toBe(first?.name)
    expect(backups[0]?.bytes).toEqual(currentBytes())
  })
})

describe('saving over a previous file that cannot be read', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const cases: {
    name: string
    previous: Uint8Array
    version: number
    options?: CodecOptions
  }[] = [
    { name: 'that is not JSON', previous: NOT_JSON, version: 0 },
    {
      name: 'whose migration throws',
      previous: versionFixtureBytes(OLDER_VERSION),
      version: OLDER_VERSION,
      options: { migration: { schemaMigrations: [throwingStep] } },
    },
  ]

  it.each(cases)(
    'writes the new document and reports why no graft was made for a previous file $name',
    async ({ previous, version, options }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const root = await rootHolding(previous)
      const project = validProject()
      const reason = decodeDocument(previous, options)
      if (reason.ok) throw new Error('Expected the previous bytes to fail to decode')

      const report = await storeOver(root, options).save('a', project)

      expect(report.graftDropped).toEqual(reason.failure)
      expect(report.faults).toEqual([])
      const written = await root.readFile(DOCUMENT_PATH)
      expect(written).toEqual(encodeDocument(project, undefined, options).bytes)
      expect(written).not.toEqual(previous)
      const warned = warn.mock.calls.map((args) => JSON.stringify(args))
      expect(warned.some((text) => text.includes(reason.failure.kind))).toBe(true)
      const backups = await backupsOf(root)
      expect(backups).toHaveLength(1)
      expect(backups[0]?.name).toMatch(
        new RegExp(`^unreadable-previous-v${version}-${DIGEST_PATTERN}\\.json$`),
      )
      expect(backups[0]?.bytes).toEqual(previous)
    },
  )
})

function growAndRename(project: Project): void {
  project.meta.name = 'Mutated'
  project.floors[0]!.walls.push(
    createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'wall-extra', thickness: 100 }),
  )
}

describe('the state a store keeps', () => {
  it('is isolated from a later change to the project that was saved', async () => {
    const store = storeOver(await rootHolding(undefined))
    const project = validProject()
    const savedName = project.meta.name
    const savedWalls = project.floors[0]!.walls.length
    await store.save('a', project)

    growAndRename(project)

    const loaded = await readProject(store, 'a')
    expect(loaded.meta.name).toBe(savedName)
    expect(loaded.floors[0]!.walls).toHaveLength(savedWalls)
  })

  it('is isolated from a change to a project that was loaded', async () => {
    const store = storeOver(await rootHolding(currentBytes()))
    const firstLoad = await readProject(store, 'a')
    const loadedName = firstLoad.meta.name
    const loadedWalls = firstLoad.floors[0]!.walls.length

    growAndRename(firstLoad)

    const secondLoad = await readProject(store, 'a')
    expect(secondLoad.meta.name).toBe(loadedName)
    expect(secondLoad.floors[0]!.walls).toHaveLength(loadedWalls)
  })
})
