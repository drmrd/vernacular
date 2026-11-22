// Helpers shared by the tests that pin one revision of the published document schema.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Json } from '../fixtures/projects/versions/fixture-documents'
import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../core'
import type { DecodedDocument, DecodeResult, Project } from '../../core'
import { schemaPath } from '../../scripts/schema/build-schema.mjs'

export function valueOf(result: DecodeResult): DecodedDocument {
  if (!result.ok) {
    throw new Error(`Expected the decode to succeed: ${JSON.stringify(result.failure)}`)
  }
  return result.value
}

export function writtenDocument(project: Project): Json {
  const { bytes } = encodeDocument(project, undefined)
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function schemaAt(revision: number): Json {
  const text = readFileSync(resolve(schemaPath(CURRENT_SCHEMA_VERSION, revision)), 'utf8')
  return JSON.parse(text)
}

export function definitionsOf(schema: Json): Record<string, Json> {
  return schema.definitions as Record<string, Json>
}

export function withSortedRequired(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedRequired)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value).map(([key, entry]) => {
    const sorted = key === 'required' && Array.isArray(entry) ? [...entry].sort() : entry
    return [key, withSortedRequired(sorted)]
  })
  return Object.fromEntries(entries)
}
