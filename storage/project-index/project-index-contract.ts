import { describe, expect, it } from 'vitest'
import type { ProjectIndex, ProjectRecord } from './project-index'
import { sampleRecord } from './project-record-test-kit'

const LARGE_PREVIEW_LENGTH = 200_000
const OTHER_HASH = 'cd'.repeat(32)

/** The parts of a record that a caller could change in place, seen through a writable type. */
interface ScribbleTarget {
  name: string | undefined
  assetHashes: string[]
  lastOpen: { opened: boolean }
}

/** Changes the record in place, at its top level and in its nested array and object. */
function scribbleOn(record: ProjectRecord): void {
  const target = record as unknown as ScribbleTarget
  target.name = 'Scribbled'
  target.assetHashes.push(OTHER_HASH)
  target.lastOpen.opened = false
}

async function idsOf(index: ProjectIndex): Promise<string[]> {
  return (await index.all()).map((record) => record.id)
}

function describeStoringRecords(makeIndex: () => ProjectIndex): void {
  it('put then get is equal', async () => {
    const index = makeIndex()
    await index.put(sampleRecord())

    expect(await index.get('house')).toEqual(sampleRecord())
  })

  it('get of an id that was never put gives undefined', async () => {
    const index = makeIndex()
    await index.put(sampleRecord())

    expect(await index.get('barn')).toBeUndefined()
  })

  it('a preview of 200,000 characters comes back equal', async () => {
    const index = makeIndex()
    const preview = 'x'.repeat(LARGE_PREVIEW_LENGTH)
    await index.put(sampleRecord({ preview }))

    expect((await index.get('house'))?.preview === preview).toBe(true)
  })
}

function describeReplacing(makeIndex: () => ProjectIndex): void {
  it('a second put under one id replaces the record', async () => {
    const index = makeIndex()
    const original = { ...sampleRecord(), unknownExtraField: 'only in the first record' }
    await index.put(original)
    const replacement = sampleRecord({
      name: undefined,
      preview: undefined,
      assetHashes: [],
      lastOpen: { opened: false, build: 'other-build', reason: 'unreadable' },
    })

    await index.put(replacement)

    const stored = await index.get('house')
    expect(stored).toEqual(replacement)
    expect(stored).not.toHaveProperty('unknownExtraField')
    expect(await idsOf(index)).toEqual(['house'])
  })
}

function describeLocations(makeIndex: () => ProjectIndex): void {
  it('a record of a project in a folder comes back equal', async () => {
    const index = makeIndex()
    const record = sampleRecord({ location: { kind: 'folder', folderName: 'Old house plans' } })
    await index.put(record)

    expect(await index.get('house')).toEqual(record)
    expect((await index.all())[0]?.location).toEqual({
      kind: 'folder',
      folderName: 'Old house plans',
    })
  })
}

function describeListing(makeIndex: () => ProjectIndex): void {
  it('all() lists every record, ordered by id', async () => {
    const index = makeIndex()
    for (const id of ['house-b', 'house-a', 'House-c', '9-barn']) {
      await index.put(sampleRecord({ id }))
    }

    expect(await idsOf(index)).toEqual(['9-barn', 'House-c', 'house-a', 'house-b'])
  })

  it('all() of an empty index gives an empty list', async () => {
    expect(await makeIndex().all()).toEqual([])
  })
}

function describeRemoving(makeIndex: () => ProjectIndex): void {
  it('remove removes one record and leaves the others', async () => {
    const index = makeIndex()
    for (const id of ['a', 'b', 'c']) await index.put(sampleRecord({ id }))

    await index.remove('b')

    expect(await index.get('b')).toBeUndefined()
    expect(await idsOf(index)).toEqual(['a', 'c'])
  })

  it('remove of an id that was never put resolves', async () => {
    await expect(makeIndex().remove('never-put')).resolves.toBeUndefined()
  })
}

function describeFidelity(makeIndex: () => ProjectIndex): void {
  it('a record with no name, no floor count, no preview, and no times comes back with those fields undefined', async () => {
    const index = makeIndex()
    await index.put(
      sampleRecord({
        name: undefined,
        floorCount: undefined,
        preview: undefined,
        lastChangedAt: undefined,
        lastUsedAt: undefined,
      }),
    )

    const record = await index.get('house')

    expect(record).toBeDefined()
    expect(record?.name).toBeUndefined()
    expect(record?.floorCount).toBeUndefined()
    expect(record?.preview).toBeUndefined()
    expect(record?.lastChangedAt).toBeUndefined()
    expect(record?.lastUsedAt).toBeUndefined()
    expect(record?.lastOpen).not.toHaveProperty('reason')
  })

  it('the stored record does not change when the caller changes the object it put or the object it got', async () => {
    const index = makeIndex()
    const put = sampleRecord()
    await index.put(put)

    scribbleOn(put)
    const got = await index.get('house')
    expect(got).toEqual(sampleRecord())

    scribbleOn(got as ProjectRecord)
    expect(await index.get('house')).toEqual(sampleRecord())
  })
}

/**
 * The behavior that every {@link ProjectIndex} has, whatever it keeps its records in. Call it once
 * from a test file with a factory that gives a new, empty index; each case runs on its own index.
 */
export function describeProjectIndexContract(label: string, makeIndex: () => ProjectIndex): void {
  describe(`${label} satisfies the ProjectIndex contract`, () => {
    describeStoringRecords(makeIndex)
    describeReplacing(makeIndex)
    describeLocations(makeIndex)
    describeListing(makeIndex)
    describeRemoving(makeIndex)
    describeFidelity(makeIndex)
  })
}
