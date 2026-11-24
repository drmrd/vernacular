import { isAssetDomainCode, type AssetDomainCode } from '../registries/asset-domains.ts'

export interface CatalogId {
  namespace: string
  domain: AssetDomainCode
  subcategory: string
  slug: string
  version: string
}

export type CatalogIdParse = { ok: true; id: CatalogId } | { ok: false; problem: string }

const NAMESPACE_TAIL_MIN_LENGTH = 1
const NAMESPACE_TAIL_MAX_LENGTH = 31
const SUBCATEGORY_MIN_LENGTH = 3
const SUBCATEGORY_MAX_LENGTH = 48
const SLUG_MIN_LENGTH = 2
const SLUG_MAX_LENGTH = 64

const VERSION_NUMBER = String.raw`(?:0|[1-9][0-9]*)`
const PRERELEASE_PART = String.raw`(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`

const NAMESPACE_PATTERN = new RegExp(
  `^(?:core|(?:org|usr|pkg)_[a-z0-9][a-z0-9-]{${NAMESPACE_TAIL_MIN_LENGTH - 1},${NAMESPACE_TAIL_MAX_LENGTH - 1}})$`,
)
const SUBCATEGORY_PATTERN = new RegExp(
  `^[a-z][a-z0-9_]{${SUBCATEGORY_MIN_LENGTH - 1},${SUBCATEGORY_MAX_LENGTH - 1}}$`,
)
const SLUG_PATTERN = new RegExp(`^[a-z][a-z0-9_]{${SLUG_MIN_LENGTH - 1},${SLUG_MAX_LENGTH - 1}}$`)
const VERSION_PATTERN = new RegExp(
  String.raw`^${VERSION_NUMBER}\.${VERSION_NUMBER}\.${VERSION_NUMBER}(?:-${PRERELEASE_PART}(?:\.${PRERELEASE_PART})*)?$`,
)

const NAMESPACE_PROBLEM = `namespace must be core, or org_, usr_, or pkg_ followed by ${NAMESPACE_TAIL_MIN_LENGTH} to ${NAMESPACE_TAIL_MAX_LENGTH} lowercase letters, digits, or hyphens`
const DOMAIN_PROBLEM = 'domain must be a known asset domain code'
const SUBCATEGORY_PROBLEM = `subcategory must be ${SUBCATEGORY_MIN_LENGTH} to ${SUBCATEGORY_MAX_LENGTH} lowercase letters, digits, or underscores, starting with a letter`
const SLUG_PROBLEM = `slug must be ${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} lowercase letters, digits, or underscores, starting with a letter`
const VERSION_PROBLEM =
  'version must be three numbers without leading zeros, optionally followed by a prerelease, and no build metadata'

const PART_NAMES = ['namespace', 'domain', 'subcategory', 'slug'] as const
const PART_SEPARATORS = [':', '.', '/', '@'] as const

interface RawCatalogParts {
  namespace: string
  domain: string
  subcategory: string
  slug: string
  version: string
}

function splitCatalogId(text: string): RawCatalogParts | string {
  const pieces: string[] = []
  let rest = text
  for (const [index, separator] of PART_SEPARATORS.entries()) {
    const separatorIndex = rest.indexOf(separator)
    if (separatorIndex === -1) {
      return `${PART_NAMES[index]} is missing: expected "${separator}" after it`
    }
    pieces.push(rest.slice(0, separatorIndex))
    rest = rest.slice(separatorIndex + 1)
  }
  const [namespace = '', domain = '', subcategory = '', slug = ''] = pieces
  return { namespace, domain, subcategory, slug, version: rest }
}

function validateCatalogParts(raw: RawCatalogParts): CatalogId | string {
  const { namespace, domain, subcategory, slug, version } = raw
  if (!NAMESPACE_PATTERN.test(namespace)) return NAMESPACE_PROBLEM
  if (!isAssetDomainCode(domain)) return DOMAIN_PROBLEM
  if (!SUBCATEGORY_PATTERN.test(subcategory)) return SUBCATEGORY_PROBLEM
  if (!SLUG_PATTERN.test(slug)) return SLUG_PROBLEM
  if (!VERSION_PATTERN.test(version)) return VERSION_PROBLEM
  return { namespace, domain, subcategory, slug, version }
}

export function parseCatalogId(text: string): CatalogIdParse {
  const raw = splitCatalogId(text)
  if (typeof raw === 'string') return { ok: false, problem: raw }
  const checked = validateCatalogParts(raw)
  if (typeof checked === 'string') return { ok: false, problem: checked }
  return { ok: true, id: checked }
}
