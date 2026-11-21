import { describe, expect, it } from 'vitest'
import {
  atHigherRevision,
  fixtureDocument,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { VERSION_FIXTURE_VERSIONS } from '../../tests/fixtures/projects/versions'
import { findRepairOffer } from './repair-list'
import type { RepairOffer } from './repair-list'
import {
  NON_DOCUMENTS,
  OLD_FIELD,
  OLDER_FIELD,
  formatFaultsOf,
  migratedDocumentOf,
  soundDocument,
  twoSolidPaintKeys,
  withMixedPaintEntries,
  withUndefinedFields,
  withoutRequiredField,
} from './repairs-test-kit'
import type { Json } from './repairs-test-kit'

/** The oldest fixture version, so its file is migrated before the check. */
const OLDEST_VERSION = VERSION_FIXTURE_VERSIONS[0] as number

const PAINT_SENTENCE = 'It removes the extra data from 2 paint entries.'
const FIELDS_SENTENCE = 'It removes 2 fields that the format does not define.'

const FLOOR_FIELD_POINTER = `/floors/0/${OLD_FIELD}`
const META_FIELD_POINTER = `/meta/${OLDER_FIELD}`

/** The pointers of the pattern fields that `withMixedPaintEntries` plants, in ascending order. */
function mixedPaintPointers(): string[] {
  return twoSolidPaintKeys()
    .flatMap((key) => [`/paint/${key}/patternId`, `/paint/${key}/scale`])
    .sort()
}

/** The sound document with both kinds of fault: mixed paint entries and undefined fields. */
function withBothFaults(): Json {
  return withUndefinedFields(withMixedPaintEntries())
}

function offerFor(document: unknown): RepairOffer {
  const offer = findRepairOffer(document)
  if (offer === undefined) throw new Error('Expected an offer')
  return offer
}

describe('the repair offer for a document that fails the format check', () => {
  it('offers one repair for a document with both a mixed paint entry and an undefined field', () => {
    const offer = offerFor(withBothFaults())

    expect(offer.sentences).toEqual([PAINT_SENTENCE, FIELDS_SENTENCE])
  })

  it('the offer lists every removed pointer once, in ascending order', () => {
    const offer = offerFor(withBothFaults())

    expect(offer.removedPaths).toEqual(
      [...mixedPaintPointers(), FLOOR_FIELD_POINTER, META_FIELD_POINTER].sort(),
    )
  })

  it('the offered document decodes with no format fault and holds none of the removed data', () => {
    const offer = offerFor(withBothFaults())

    expect(formatFaultsOf(offer.document)).toEqual([])
    expect(offer.document).toStrictEqual(soundDocument())
  })

  it('offers the paint repair alone for a document with only mixed paint entries', () => {
    const offer = offerFor(withMixedPaintEntries())

    expect(offer.sentences).toEqual([PAINT_SENTENCE])
    expect(offer.removedPaths).toEqual(mixedPaintPointers())
  })

  it('offers a repair for the migrated document of an older file with an undefined field', () => {
    const older = withUndefinedFields(fixtureDocument(OLDEST_VERSION))
    const offer = offerFor(migratedDocumentOf(older))

    expect(offer.sentences).toEqual([FIELDS_SENTENCE])
    expect(offer.removedPaths).toEqual([FLOOR_FIELD_POINTER, META_FIELD_POINTER])
    expect(formatFaultsOf(offer.document)).toEqual([])
  })
})

describe('no repair offer', () => {
  it('offers nothing for a document that lacks a required field', () => {
    const document = withoutRequiredField()

    expect(formatFaultsOf(document)).not.toHaveLength(0)
    expect(findRepairOffer(document)).toBeUndefined()
  })

  it('offers nothing when the document still fails after every repair', () => {
    const document = withoutRequiredField(withBothFaults())

    expect(findRepairOffer(document)).toBeUndefined()
  })

  it('offers nothing for a document that passes the check', () => {
    expect(formatFaultsOf(soundDocument())).toEqual([])
    expect(findRepairOffer(soundDocument())).toBeUndefined()
  })

  it('offers nothing for a value that is no object', () => {
    for (const value of NON_DOCUMENTS) expect(findRepairOffer(value)).toBeUndefined()
  })

  it("offers nothing for a document of a higher revision than this build's", () => {
    expect(findRepairOffer(atHigherRevision(withBothFaults()))).toBeUndefined()
  })
})

describe('the document that the offer is asked about', () => {
  it('does not change the document that it was given', () => {
    const document = withBothFaults()
    const before = structuredClone(document)

    expect(findRepairOffer(document)).not.toBeUndefined()
    expect(document).toStrictEqual(before)
  })
})
