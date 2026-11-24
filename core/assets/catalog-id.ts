import { isAssetDomainCode, type AssetDomainCode } from '../registries/asset-domains.ts'

export interface CatalogId {
  namespace: string
  domain: AssetDomainCode
  subcategory: string
  slug: string
  version: string
}

export type CatalogIdParse = { ok: true; id: CatalogId } | { ok: false; problem: string }

export const RESERVED_NAMESPACE_PREFIXES: readonly string[] = Object.freeze(['mfr_'])

const NAMESPACE_TAIL_MIN_LENGTH = 1
const NAMESPACE_TAIL_MAX_LENGTH = 31
const SUBCATEGORY_MIN_LENGTH = 3
const SUBCATEGORY_MAX_LENGTH = 48
const SLUG_MIN_LENGTH = 2
const SLUG_MAX_LENGTH = 64

const VERSION_NUMBER = String.raw`(?:0|[1-9][0-9]*)`
const PRERELEASE_PART = String.raw`(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`

function restLengthQuantifier(minLength: number, maxLength: number): string {
  return `{${minLength - 1},${maxLength - 1}}`
}

const NAMESPACE_PATTERN = new RegExp(
  `^(?:core|(?:org|usr|pkg)_[a-z0-9][a-z0-9-]${restLengthQuantifier(NAMESPACE_TAIL_MIN_LENGTH, NAMESPACE_TAIL_MAX_LENGTH)})$`,
)
const SUBCATEGORY_PATTERN = new RegExp(
  `^[a-z][a-z0-9_]${restLengthQuantifier(SUBCATEGORY_MIN_LENGTH, SUBCATEGORY_MAX_LENGTH)}$`,
)
const SLUG_PATTERN = new RegExp(
  `^[a-z][a-z0-9_]${restLengthQuantifier(SLUG_MIN_LENGTH, SLUG_MAX_LENGTH)}$`,
)
const VERSION_PATTERN = new RegExp(
  String.raw`^${VERSION_NUMBER}\.${VERSION_NUMBER}\.${VERSION_NUMBER}(?:-${PRERELEASE_PART}(?:\.${PRERELEASE_PART})*)?$`,
)

const NAMESPACE_PROBLEM = `namespace must be core, or org_, usr_, or pkg_ followed by ${NAMESPACE_TAIL_MIN_LENGTH} to ${NAMESPACE_TAIL_MAX_LENGTH} lowercase letters, digits, or hyphens, starting with a letter or digit`
const DOMAIN_PROBLEM = 'domain must be a known asset domain code'
const SUBCATEGORY_PROBLEM = `subcategory must be ${SUBCATEGORY_MIN_LENGTH} to ${SUBCATEGORY_MAX_LENGTH} lowercase letters, digits, or underscores, starting with a letter`
const SLUG_PROBLEM = `slug must be ${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} lowercase letters, digits, or underscores, starting with a letter`
const VERSION_PROBLEM =
  'version must be three numbers without leading zeros, optionally followed by a prerelease, and no build metadata'

const PART_NAMES = ['namespace', 'domain', 'subcategory', 'slug', 'version'] as const
const PART_SEPARATORS = [':', '.', '/', '@'] as const

interface RawCatalogParts {
  namespace: string
  domain: string
  subcategory: string
  slug: string
  version: string
}

type SplitResult = { ok: true; parts: RawCatalogParts } | { ok: false; problem: string }

function splitCatalogId(text: string): SplitResult {
  const pieces: string[] = []
  let rest = text
  for (const [index, separator] of PART_SEPARATORS.entries()) {
    const separatorIndex = rest.indexOf(separator)
    if (separatorIndex === -1) {
      const missingPart = PART_NAMES[index + 1]
      const previousPart = PART_NAMES[index]
      return {
        ok: false,
        problem: `${missingPart} is missing: expected "${separator}" after the ${previousPart}`,
      }
    }
    pieces.push(rest.slice(0, separatorIndex))
    rest = rest.slice(separatorIndex + 1)
  }
  const [namespace = '', domain = '', subcategory = '', slug = ''] = pieces
  return { ok: true, parts: { namespace, domain, subcategory, slug, version: rest } }
}

function validateCatalogParts(raw: RawCatalogParts): CatalogIdParse {
  const { namespace, domain, subcategory, slug, version } = raw
  const reservedPrefix = RESERVED_NAMESPACE_PREFIXES.find((prefix) => namespace.startsWith(prefix))
  if (reservedPrefix !== undefined) {
    return { ok: false, problem: `namespace prefix "${reservedPrefix}" is reserved` }
  }
  if (!NAMESPACE_PATTERN.test(namespace)) return { ok: false, problem: NAMESPACE_PROBLEM }
  if (!isAssetDomainCode(domain)) return { ok: false, problem: DOMAIN_PROBLEM }
  if (!SUBCATEGORY_PATTERN.test(subcategory)) return { ok: false, problem: SUBCATEGORY_PROBLEM }
  if (!SLUG_PATTERN.test(slug)) return { ok: false, problem: SLUG_PROBLEM }
  if (!VERSION_PATTERN.test(version)) return { ok: false, problem: VERSION_PROBLEM }
  return { ok: true, id: { namespace, domain, subcategory, slug, version } }
}

export function parseCatalogId(text: string): CatalogIdParse {
  const split = splitCatalogId(text)
  return split.ok ? validateCatalogParts(split.parts) : split
}
