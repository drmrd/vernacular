import { isAssetDomainCode, type AssetDomainCode } from '../registries/asset-domains.ts'
import { isSemanticVersion } from './semantic-version.ts'

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

function restLengthQuantifier(minLength: number, maxLength: number): string {
  return `{${minLength - 1},${maxLength - 1}}`
}

export function lowercaseWordPattern(minLength: number, maxLength: number): RegExp {
  return new RegExp(`^[a-z][a-z0-9_]${restLengthQuantifier(minLength, maxLength)}$`)
}

export function lowercaseWordProblem(part: string, minLength: number, maxLength: number): string {
  return `${part} must be ${minLength} to ${maxLength} lowercase letters, digits, or underscores, starting with a letter`
}

const NAMESPACE_PATTERN = new RegExp(
  `^(?:core|(?:org|usr|pkg)_[a-z0-9][a-z0-9-]${restLengthQuantifier(NAMESPACE_TAIL_MIN_LENGTH, NAMESPACE_TAIL_MAX_LENGTH)})$`,
)
export const SUBCATEGORY_PATTERN = lowercaseWordPattern(
  SUBCATEGORY_MIN_LENGTH,
  SUBCATEGORY_MAX_LENGTH,
)
export const SLUG_PATTERN = lowercaseWordPattern(SLUG_MIN_LENGTH, SLUG_MAX_LENGTH)

const NAMESPACE_PROBLEM = `namespace must be core, or org_, usr_, or pkg_ followed by ${NAMESPACE_TAIL_MIN_LENGTH} to ${NAMESPACE_TAIL_MAX_LENGTH} lowercase letters, digits, or hyphens, starting with a letter or digit`
export const DOMAIN_PROBLEM = 'domain must be a known asset domain code'
export const SUBCATEGORY_PROBLEM = lowercaseWordProblem(
  'subcategory',
  SUBCATEGORY_MIN_LENGTH,
  SUBCATEGORY_MAX_LENGTH,
)
export const SLUG_PROBLEM = lowercaseWordProblem('slug', SLUG_MIN_LENGTH, SLUG_MAX_LENGTH)
const VERSION_PROBLEM =
  'version must be three numbers without leading zeros, optionally followed by a prerelease, and no build metadata'

const PART_NAMES = ['namespace', 'domain', 'subcategory', 'slug', 'version'] as const
const SEPARATOR_AFTER_NAMESPACE = ':'
export const SEPARATOR_AFTER_DOMAIN = '.'
export const SEPARATOR_AFTER_SUBCATEGORY = '/'
const SEPARATOR_AFTER_SLUG = '@'
const PART_SEPARATORS = [
  SEPARATOR_AFTER_NAMESPACE,
  SEPARATOR_AFTER_DOMAIN,
  SEPARATOR_AFTER_SUBCATEGORY,
  SEPARATOR_AFTER_SLUG,
] as const

export function missingPartProblem(missing: string, separator: string, previous: string): string {
  return `${missing} is missing: expected "${separator}" after the ${previous}`
}

interface RawCatalogParts {
  namespace: string
  domain: string
  subcategory: string
  slug: string
  version: string
}

type SplitResult = { ok: true; parts: RawCatalogParts } | { ok: false; problem: string }

function namespaceProblem(namespace: string): string | undefined {
  const reservedPrefix = RESERVED_NAMESPACE_PREFIXES.find((prefix) => namespace.startsWith(prefix))
  if (reservedPrefix !== undefined) return `namespace prefix "${reservedPrefix}" is reserved`
  return NAMESPACE_PATTERN.test(namespace) ? undefined : NAMESPACE_PROBLEM
}

const PART_CHECKS: Record<(typeof PART_NAMES)[number], (part: string) => string | undefined> = {
  namespace: namespaceProblem,
  domain: (part) => (isAssetDomainCode(part) ? undefined : DOMAIN_PROBLEM),
  subcategory: (part) => (SUBCATEGORY_PATTERN.test(part) ? undefined : SUBCATEGORY_PROBLEM),
  slug: (part) => (SLUG_PATTERN.test(part) ? undefined : SLUG_PROBLEM),
  version: (part) => (isSemanticVersion(part) ? undefined : VERSION_PROBLEM),
}

function firstPartProblem(parts: readonly string[]): string | undefined {
  for (const [index, name] of PART_NAMES.entries()) {
    const part = parts[index]
    if (part === undefined) return undefined
    const problem = PART_CHECKS[name](part)
    if (problem !== undefined) return problem
  }
  return undefined
}

function splitCatalogId(text: string): SplitResult {
  const pieces: string[] = []
  let rest = text
  for (const [index, separator] of PART_SEPARATORS.entries()) {
    const separatorIndex = rest.indexOf(separator)
    if (separatorIndex === -1) {
      const missingPart = PART_NAMES[index + 1] ?? ''
      const previousPart = PART_NAMES[index] ?? ''
      const problem =
        firstPartProblem([...pieces, rest]) ??
        missingPartProblem(missingPart, separator, previousPart)
      return { ok: false, problem }
    }
    pieces.push(rest.slice(0, separatorIndex))
    rest = rest.slice(separatorIndex + 1)
  }
  const [namespace = '', domain = '', subcategory = '', slug = ''] = pieces
  return { ok: true, parts: { namespace, domain, subcategory, slug, version: rest } }
}

function validateCatalogParts(raw: RawCatalogParts): CatalogIdParse {
  const { namespace, domain, subcategory, slug, version } = raw
  const problem = firstPartProblem([namespace, domain, subcategory, slug, version])
  if (problem !== undefined) return { ok: false, problem }
  // Only narrows `domain`: firstPartProblem has already rejected a bad domain.
  if (!isAssetDomainCode(domain)) return { ok: false, problem: DOMAIN_PROBLEM }
  return { ok: true, id: { namespace, domain, subcategory, slug, version } }
}

export function parseCatalogId(text: string): CatalogIdParse {
  const split = splitCatalogId(text)
  return split.ok ? validateCatalogParts(split.parts) : split
}

/** Does not validate: trusts the caller to pass an id from `parseCatalogId` or one that meets the grammar. */
export function formatCatalogId(id: CatalogId): string {
  const { namespace, domain, subcategory, slug, version } = id
  return `${namespace}${SEPARATOR_AFTER_NAMESPACE}${domain}${SEPARATOR_AFTER_DOMAIN}${subcategory}${SEPARATOR_AFTER_SUBCATEGORY}${slug}${SEPARATOR_AFTER_SLUG}${version}`
}

export function categoryOf(id: CatalogId): string {
  return `${id.domain}${SEPARATOR_AFTER_DOMAIN}${id.subcategory}`
}
