import { describe, expect, it } from 'vitest'
import { firstWallOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import { DATA_REMOVING_REPAIRS } from './repair-list'
import type { DataRemovingRepair } from './repair-list'
import {
  ALL_PATTERN_FIELDS,
  NON_DOCUMENTS,
  OLD_FIELD,
  PATTERN_FIELDS,
  SOLID_FIELDS,
  firstFloorOf,
  formatFaultsOf,
  patternPaintKey,
  roomOverridesOf,
  soundDocument,
  twoSolidPaintKeys,
  withFaultLikeExtensions,
  withMixedPaintEntries,
  withMixedUnderlaySource,
  withPaintEntry,
  withPaintEntryFields,
  withUndefinedFields,
  withWrongShapedItems,
  withWrongShapedPaintEntries,
  withWrongShapedValues,
} from './repairs-test-kit'
import type { Json } from './repairs-test-kit'

type RepairId = DataRemovingRepair['id']

function repairNamed(id: RepairId): DataRemovingRepair {
  const repair = DATA_REMOVING_REPAIRS.find((candidate: DataRemovingRepair) => candidate.id === id)
  if (repair === undefined) throw new Error(`The list holds no repair named ${id}`)
  return repair
}

/** The pointers of `fields` on each paint entry of `keys`, entry by entry. */
function paintPointers(keys: readonly string[], fields: readonly string[]): string[] {
  return keys.flatMap((key) => fields.map((field) => `/paint/${key}/${field}`))
}

const paintRepair = repairNamed('mixed-paint-entry')
const fieldsRepair = repairNamed('undefined-fields')

describe('the repair of mixed paint entries', () => {
  it('recognizes a document with two solid paint entries that hold pattern fields', () => {
    expect(paintRepair.recognizes(withMixedPaintEntries())).toBe(true)
  })

  it('removes the pattern fields of both entries and lists their pointers in ascending order', () => {
    const { removed } = paintRepair.apply(withMixedPaintEntries())

    expect(removed).toEqual(paintPointers(twoSolidPaintKeys(), ['patternId', 'scale']))
  })

  it('says "It removes the extra data from 2 paint entries."', () => {
    const { removed } = paintRepair.apply(withMixedPaintEntries())

    expect(paintRepair.describe(removed)).toBe('It removes the extra data from 2 paint entries.')
  })

  it('says "It removes the extra data from 1 paint entry." for one entry with three extra fields', () => {
    const [key] = twoSolidPaintKeys()
    const { removed } = paintRepair.apply(
      withPaintEntryFields(soundDocument(), key, ALL_PATTERN_FIELDS),
    )

    expect(removed).toHaveLength(3)
    expect(paintRepair.describe(removed)).toBe('It removes the extra data from 1 paint entry.')
  })

  it('removes the solid fields of a pattern paint entry', () => {
    const key = patternPaintKey()
    const { removed } = paintRepair.apply(withPaintEntryFields(soundDocument(), key, SOLID_FIELDS))

    expect(removed).toEqual(paintPointers([key], ['color', 'finishId']))
  })

  it('does not recognize a document whose paint entries hold only the fields of their own kind', () => {
    expect(paintRepair.recognizes(soundDocument())).toBe(false)
  })

  it('leaves a paint entry alone when its kind names no variant', () => {
    const unnamed = withPaintEntry(soundDocument(), 'odd', {
      kind: 'gradient',
      ...PATTERN_FIELDS,
      ...SOLID_FIELDS,
    })

    expect(paintRepair.recognizes(unnamed)).toBe(false)
    expect(paintRepair.apply(unnamed).removed).toEqual([])
  })

  it('leaves an underlay source that mixes two kinds alone', () => {
    const mixed = withMixedUnderlaySource()

    expect(paintRepair.recognizes(mixed)).toBe(false)
    expect(paintRepair.apply(mixed).removed).toEqual([])
    expect(paintRepair.apply(mixed).document).toStrictEqual(withMixedUnderlaySource())
  })

  it('leaves an undefined field of a paint entry to the other repair', () => {
    const [key] = twoSolidPaintKeys()
    const document = withPaintEntryFields(soundDocument(), key, { [OLD_FIELD]: 1 })

    expect(paintRepair.recognizes(document)).toBe(false)
    expect(fieldsRepair.apply(document).removed).toEqual([`/paint/${key}/${OLD_FIELD}`])
  })
})

describe('the repair of undefined fields', () => {
  it('keeps the keys of an underlay source that mixes two kinds', () => {
    const mixed = withMixedUnderlaySource()

    expect(fieldsRepair.recognizes(mixed)).toBe(false)
    expect(fieldsRepair.apply(mixed).removed).toEqual([])
  })

  it('recognizes a document with x-old on a floor and x-older in the meta', () => {
    expect(fieldsRepair.recognizes(withUndefinedFields())).toBe(true)
  })

  it('lists the removed fields as /floors/0/x-old and /meta/x-older', () => {
    const { removed } = fieldsRepair.apply(withUndefinedFields())

    expect(removed).toEqual(['/floors/0/x-old', '/meta/x-older'])
  })

  it('says "It removes 2 fields that the format does not define."', () => {
    const { removed } = fieldsRepair.apply(withUndefinedFields())

    expect(fieldsRepair.describe(removed)).toBe(
      'It removes 2 fields that the format does not define.',
    )
  })

  it('says "It removes 1 field that the format does not define." for one field', () => {
    const document = soundDocument()
    firstFloorOf(document)[OLD_FIELD] = 1
    const { removed } = fieldsRepair.apply(document)

    expect(removed).toEqual(['/floors/0/x-old'])
    expect(fieldsRepair.describe(removed)).toBe(
      'It removes 1 field that the format does not define.',
    )
  })

  it('keeps a field that another variant of a union defines', () => {
    const mixed = withMixedPaintEntries()

    expect(fieldsRepair.recognizes(mixed)).toBe(false)
    expect(fieldsRepair.apply(mixed).removed).toEqual([])
  })

  it('removes an undefined field inside an array item and inside a map value, and never a key of a map', () => {
    const document = soundDocument()
    const rooms = roomOverridesOf(document)
    const [roomKey] = Object.keys(rooms)
    const room = roomKey === undefined ? undefined : rooms[roomKey]
    if (room === undefined) throw new Error('The sound document holds no room override')
    firstWallOf(document)['x-wall'] = 1
    room['x-room'] = 2
    rooms['x-not-a-field'] = { name: 'Kept' }
    const applied = fieldsRepair.apply(document)

    expect(applied.removed).toEqual([
      '/floors/0/walls/0/x-wall',
      `/roomOverrides/${roomKey}/x-room`,
    ])
    expect(roomOverridesOf(applied.document as Json)['x-not-a-field']).toEqual({ name: 'Kept' })
  })

  it('escapes a slash and a tilde in a pointer', () => {
    const document = soundDocument()
    firstFloorOf(document)['a/b'] = 1
    firstFloorOf(document)['c~d'] = 2
    roomOverridesOf(document)['rooms/a~b'] = { name: 'Odd', [OLD_FIELD]: 3 }

    expect(fieldsRepair.apply(document).removed).toEqual([
      '/floors/0/a~1b',
      '/floors/0/c~0d',
      '/roomOverrides/rooms~1a~0b/x-old',
    ])
  })

  it('does not recognize a sound document', () => {
    expect(fieldsRepair.recognizes(soundDocument())).toBe(false)
  })
})

const REPAIRS_AND_THEIR_FAULTS = [
  { id: 'mixed-paint-entry', faulty: withMixedPaintEntries },
  { id: 'undefined-fields', faulty: withUndefinedFields },
] as const

describe.each(REPAIRS_AND_THEIR_FAULTS)('the repair $id', ({ id, faulty }) => {
  const repair = repairNamed(id)

  it('gives a document that decodes with no format fault', () => {
    const document = faulty()
    const { document: repaired } = repair.apply(document)

    expect(formatFaultsOf(document)).not.toHaveLength(0)
    expect(formatFaultsOf(repaired)).toEqual([])
  })

  it('removes nothing inside extensions, at the root or deeper', () => {
    const document = withFaultLikeExtensions(faulty())
    const { document: repaired, removed } = repair.apply(document) as {
      document: Json
      removed: string[]
    }

    expect(removed.filter((pointer) => pointer.includes('/extensions'))).toEqual([])
    expect(repaired.extensions).toStrictEqual(document.extensions)
    expect(firstFloorOf(repaired).extensions).toStrictEqual(firstFloorOf(document).extensions)
  })

  it('keeps every other value of the document', () => {
    expect(repair.apply(faulty()).document).toStrictEqual(soundDocument())
  })

  it('does not change the document that it was given', () => {
    const document = faulty()
    const before = structuredClone(document)
    repair.apply(document)

    expect(document).toStrictEqual(before)
  })

  it('does not throw for a value of the wrong shape, and removes nothing there', () => {
    const shapes = [
      withWrongShapedValues(),
      withWrongShapedItems(),
      withWrongShapedPaintEntries(),
      ...NON_DOCUMENTS,
    ]

    for (const shape of shapes) {
      const before = structuredClone(shape)
      expect(repair.recognizes(shape)).toBe(false)
      expect(repair.apply(shape).removed).toEqual([])
      expect(shape).toStrictEqual(before)
    }
  })
})

describe('the list of repairs', () => {
  it('the list holds the paint repair first, then the repair of undefined fields', () => {
    expect(DATA_REMOVING_REPAIRS.map((repair: DataRemovingRepair) => repair.id)).toEqual([
      'mixed-paint-entry',
      'undefined-fields',
    ])
  })
})
