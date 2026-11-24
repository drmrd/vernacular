// core/assets/catalog.ts
//
// The shape of catalog.json, the one file in a store that changes (spec
// "catalog.json"). validateCatalog never throws; each error starts with the
// path it names. A reader ignores fields it does not know.

import { isRecord } from './is-record.ts'
import { isSemanticVersion, SEMANTIC_VERSION_RULE } from './semantic-version.ts'
import { isSha256Hex } from './sha256-hex.ts'

export const CATALOG_VERSION = 1

export interface CatalogPackEntry {
  packId: string
  version: string
  formatVersion: number
  manifest: { sha256: string; byteLength: number }
  byteLength: number
  itemCount: number
}

export interface Catalog {
  catalogVersion: 1
  name?: string
  packs: CatalogPackEntry[]
}

export type CatalogValidation =
  | { outcome: 'valid'; catalog: Catalog }
  | { outcome: 'newer-version' }
  | { outcome: 'invalid'; errors: string[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

type Check = [message: string, holds: boolean]

function failedMessages(checks: Check[]): string[] {
  return checks.filter(([, holds]) => !holds).map(([message]) => message)
}

function manifestProblems(manifest: unknown, path: string): string[] {
  if (!isPlainObject(manifest)) return [`${path} must be an object`]
  return failedMessages([
    [`${path}.sha256 must be 64 lower-case hex characters`, isSha256Hex(manifest['sha256'])],
    [`${path}.byteLength must be a positive integer`, isPositiveInteger(manifest['byteLength'])],
  ])
}

function entryProblems(entry: unknown, path: string): string[] {
  if (!isPlainObject(entry)) return [`${path} must be an object`]
  return [
    ...failedMessages([
      [`${path}.packId must be a non-empty string`, isNonEmptyString(entry['packId'])],
      [`${path}.version must be ${SEMANTIC_VERSION_RULE}`, isSemanticVersion(entry['version'])],
      [
        `${path}.formatVersion must be a positive integer`,
        isPositiveInteger(entry['formatVersion']),
      ],
    ]),
    // The entry checks are split around the manifest checks to keep errors in field order.
    ...manifestProblems(entry['manifest'], `${path}.manifest`),
    ...failedMessages([
      [
        `${path}.byteLength must be a non-negative integer`,
        isNonNegativeInteger(entry['byteLength']),
      ],
      [
        `${path}.itemCount must be a non-negative integer`,
        isNonNegativeInteger(entry['itemCount']),
      ],
    ]),
  ]
}

export function validateCatalog(value: unknown): CatalogValidation {
  if (!isPlainObject(value)) return { outcome: 'invalid', errors: ['catalog must be an object'] }
  const version = value['catalogVersion']
  if (isPositiveInteger(version) && version > CATALOG_VERSION) return { outcome: 'newer-version' }
  const packs = value['packs']
  const errors = [
    ...failedMessages([
      ['catalogVersion must be a positive integer', isPositiveInteger(version)],
      ['$schema must be a string', isOptionalString(value['$schema'])],
      ['name must be a string', isOptionalString(value['name'])],
      ['packs must be an array', Array.isArray(packs)],
    ]),
    ...(Array.isArray(packs) ? packs : []).flatMap((entry, index) =>
      entryProblems(entry, `packs[${index}]`),
    ),
  ]
  if (errors.length > 0) return { outcome: 'invalid', errors }
  return { outcome: 'valid', catalog: value as unknown as Catalog }
}
