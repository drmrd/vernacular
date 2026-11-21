import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../index'
import type { FormatFault } from '../index'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'

export type { Json }

/** Keys that the format does not define, as an older build might have written them. */
export const OLD_FIELD = 'x-old'
export const OLDER_FIELD = 'x-older'

/** The hash of an asset that no document holds, for an underlay source. */
const ASSET = { scope: 'project', contentHash: 'sha256-0' }

/** A value that is a number and no map, for a place that holds a map. */
const NOT_A_MAP = 7

/** A namespace that no build knows, so its data is kept whole. */
const NAMESPACE = 'org.example.probe'

/** Data under `extensions` that no repair may read or change. */
export const PLAIN_EXTENSIONS: Json = { [NAMESPACE]: { tags: ['kept'] } }

/**
 * Data under `extensions` that looks like the faults the repairs remove: a field that the format
 * does not define, and a paint entry that mixes two kinds.
 */
export const FAULT_LIKE_EXTENSIONS: Json = {
  [NAMESPACE]: {
    tags: ['kept'],
    [OLD_FIELD]: 1,
    nested: { deeper: { [OLDER_FIELD]: 2 } },
    paint: { sample: { kind: 'solid', patternId: 'plank', scale: 100 } },
  },
}

/** The fields of a pattern paint entry, as a solid entry might carry them in error. */
export const PATTERN_FIELDS: Json = { patternId: 'plank', scale: 100 }

/** The fields of a pattern paint entry, all three, as a solid entry might carry them in error. */
export const ALL_PATTERN_FIELDS: Json = { patternId: 'plank', scale: 100, colors: [] }

/** The fields of a solid paint entry that a pattern entry might carry in error. */
export const SOLID_FIELDS: Json = { color: { srgbHex: '#ffffff' }, finishId: 'flat' }

function paintOf(document: Json): Record<string, Json> {
  return document.paint as Record<string, Json>
}

/** The first floor of the document; throws when it has none. */
export function firstFloorOf(document: Json): Json {
  const floor = (document.floors as Json[])[0]
  if (floor === undefined) throw new Error('The document has no floor')
  return floor
}

/** The keys of the paint entries of the given kind, in the order of the document. */
export function paintKeysOfKind(document: Json, kind: string): string[] {
  const paint = paintOf(document)
  return Object.keys(paint).filter((key) => paint[key]?.kind === kind)
}

/**
 * The document of the current version, as a stored project: solid and pattern paint entries, two
 * floors, and plain data under `extensions` at the root and on the first floor. It breaks no rule.
 */
export function soundDocument(): Json {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  document.extensions = structuredClone(PLAIN_EXTENSIONS)
  firstFloorOf(document).extensions = structuredClone(PLAIN_EXTENSIONS)
  return document
}

/**
 * The keys of two solid paint entries of the sound document, in ascending order. It skips the
 * second solid key on purpose: the document order of these two keys then differs from their sorted
 * order, so a repair that lists pointers in document order fails the ascending-order case.
 */
export function twoSolidPaintKeys(): readonly [string, string] {
  const keys = paintKeysOfKind(soundDocument(), 'solid')
  const [first, , third] = keys
  if (first === undefined || third === undefined) throw new Error('Expected three solid entries')
  return [first, third].sort() as [string, string]
}

/** The key of the one pattern paint entry of the sound document. */
export function patternPaintKey(): string {
  const [key] = paintKeysOfKind(soundDocument(), 'pattern')
  if (key === undefined) throw new Error('Expected a pattern paint entry')
  return key
}

/** The document, with `fields` added to the paint entry under `key`. */
export function withPaintEntryFields(document: Json, key: string, fields: Json): Json {
  Object.assign(paintOf(document)[key] as Json, structuredClone(fields))
  return document
}

/** The sound document, in which two solid paint entries also carry pattern fields. */
export function withMixedPaintEntries(document: Json = soundDocument()): Json {
  for (const key of twoSolidPaintKeys()) withPaintEntryFields(document, key, PATTERN_FIELDS)
  return document
}

/** The document, with `x-old` on the first floor and `x-older` in the meta. */
export function withUndefinedFields(document: Json = soundDocument()): Json {
  firstFloorOf(document)[OLD_FIELD] = 1
  metaOf(document)[OLDER_FIELD] = 2
  return document
}

/** The document, with the fault-like data of `FAULT_LIKE_EXTENSIONS` in both of its `extensions`. */
export function withFaultLikeExtensions(document: Json): Json {
  document.extensions = structuredClone(FAULT_LIKE_EXTENSIONS)
  firstFloorOf(document).extensions = structuredClone(FAULT_LIKE_EXTENSIONS)
  return document
}

/**
 * The faults that the format check finds in the document: none when it decodes, and the faults of
 * the failure when it breaks the format rules. Throws for any other failure.
 */
export function formatFaultsOf(document: unknown): readonly FormatFault[] {
  const result = decodeDocument(bytesOf(document))
  if (result.ok) return []
  if (result.failure.kind !== 'format-rules') {
    throw new Error(`Expected a format fault or none, got ${result.failure.kind}`)
  }
  return result.failure.faults
}

/**
 * The document that the codec hands over when it refuses `document` for its format faults: the
 * migrated document, as the open path gives it to a repair. Throws when the decode does not fail
 * that way, or when no migration ran.
 */
export function migratedDocumentOf(document: unknown): unknown {
  const result = decodeDocument(bytesOf(document))
  if (result.ok || result.failure.kind !== 'format-rules') {
    throw new Error('Expected the decode to fail for its format faults')
  }
  if (result.failure.migratedFrom === undefined) throw new Error('Expected a migration to run')
  return result.failure.document
}

/** The document, without the walls of its first floor, a field that the format requires. */
export function withoutRequiredField(document: Json = soundDocument()): Json {
  delete firstFloorOf(document).walls
  return document
}

/** The room overrides of the document, keyed as the document keys them. */
export function roomOverridesOf(document: Json): Record<string, Json> {
  return document.roomOverrides as Record<string, Json>
}

/** The document, with a paint entry added under `key`. */
export function withPaintEntry(document: Json, key: string, entry: Json): Json {
  paintOf(document)[key] = structuredClone(entry)
  return document
}

/** The document, in which the maps and lists of the format hold values of another shape. */
export function withWrongShapedValues(document: Json = soundDocument()): Json {
  document.paint = ['not', 'a', 'map']
  document.floors = 'none'
  document.roomOverrides = NOT_A_MAP
  document.site = null
  return document
}

/** The document, whose first floor holds an underlay with a source of kind raster that also has the fields of a document source. */
export function withMixedUnderlaySource(document: Json = soundDocument()): Json {
  firstFloorOf(document).underlays = [
    {
      id: 'underlay-mixed',
      source: { kind: 'raster', image: ASSET, document: ASSET, page: 1 },
      width: 1,
      height: 1,
      placement: { offset: { x: 0, y: 0 }, millimetersPerPixel: 1, rotation: 0 },
      opacity: 1,
      visible: true,
    },
  ]
  return document
}

/** The document, in which the list of floors holds an item that is no floor. */
export function withWrongShapedItems(document: Json = soundDocument()): Json {
  document.floors = ['x']
  return document
}

/** The document, in which each paint entry is a value that is no paint entry, or names no kind. */
export function withWrongShapedPaintEntries(document: Json = soundDocument()): Json {
  document.paint = {
    text: 'solid',
    list: ['solid'],
    nothing: null,
    unnamedKind: { kind: 'gradient', [OLD_FIELD]: 1, ...PATTERN_FIELDS, ...SOLID_FIELDS },
  }
  return document
}

/** Values that are no document at all. */
export const NON_DOCUMENTS: readonly unknown[] = [
  null,
  undefined,
  'text',
  NOT_A_MAP,
  true,
  [],
  ['paint'],
]
