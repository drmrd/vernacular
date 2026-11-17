import { CURRENT_SCHEMA_REVISION, decodeDocument } from '../../../../core'
import type { CodecOptions, Project } from '../../../../core'
import { versionFixtureBytes } from './index'

/** A parsed JSON object whose shape a test changes before it encodes the object again. */
export type Json = Record<string, unknown>

/** The key that no version of the format knows, which tests plant to see how it is handled. */
export const UNKNOWN_FIELD = 'x-unknown'

/** Where the format check reports `UNKNOWN_FIELD` when it sits on the first wall of the first floor. */
export const UNKNOWN_WALL_FIELD_PATH = `/floors/0/walls/0/${UNKNOWN_FIELD}`

/** The revision above the one of this build, as a newer build writes it. */
export const HIGHER_REVISION = CURRENT_SCHEMA_REVISION + 1

/** The stored document of `version` as a fresh, parsed object. */
export function fixtureDocument(version: number): Json {
  return JSON.parse(new TextDecoder().decode(versionFixtureBytes(version)))
}

/** The UTF-8 bytes of the JSON text of `document`. */
export function bytesOf(document: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document))
}

/** The project that the bytes decode to; throws, naming the failure, when they do not decode. */
export function projectOf(bytes: Uint8Array, options?: CodecOptions): Project {
  const result = decodeDocument(bytes, options)
  if (!result.ok) {
    throw new Error(`Expected the decode to succeed: ${JSON.stringify(result.failure)}`)
  }
  return result.value.project
}

export function metaOf(document: Json): Json {
  return document.meta as Json
}

/** The first wall of the first floor; throws when the document has none. */
export function firstWallOf(document: Json): Json {
  const floors = document.floors as { walls: Json[] }[]
  const wall = floors[0]?.walls[0]
  if (wall === undefined) throw new Error('The document has no wall')
  return wall
}

/** The document, with `UNKNOWN_FIELD` set on its first wall. */
export function withUnknownWallField(document: Json): Json {
  firstWallOf(document)[UNKNOWN_FIELD] = 1
  return document
}

/** The document, with the revision of a newer build in `meta.schemaRevision`. */
export function atHigherRevision(document: Json): Json {
  metaOf(document).schemaRevision = HIGHER_REVISION
  return document
}

/** The key of the first paint entry of the given `kind`; throws when there is none. */
export function paintKeyOfKind(document: Json, kind: string): string {
  const paint = document.paint as Record<string, Json>
  const key = Object.keys(paint).find((candidate) => paint[candidate]?.kind === kind)
  if (key === undefined) throw new Error(`The document has no paint entry of kind ${kind}`)
  return key
}
