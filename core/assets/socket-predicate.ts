import { isAssetDomainCode, type AssetDomainCode } from '../registries/asset-domains.ts'
import {
  SLUG_PATTERN,
  SLUG_PROBLEM,
  SUBCATEGORY_PATTERN,
  SUBCATEGORY_PROBLEM,
  type CatalogId,
} from './catalog-id.ts'

export interface SocketPredicate {
  domain: AssetDomainCode
  subcategory?: string
  slug?: string
}

export type SocketPredicateParse =
  | { ok: true; predicate: SocketPredicate }
  | { ok: false; problem: string }

const WILDCARD = '*'
const DOMAIN_SEPARATOR = '.'
const SLUG_SEPARATOR = '/'
const DOMAIN_PROBLEM = 'domain must be a known asset domain code'

function refuse(problem: string): SocketPredicateParse {
  return { ok: false, problem }
}

function parseCategoryPart(domain: AssetDomainCode, categoryText: string): SocketPredicateParse {
  const separatorIndex = categoryText.indexOf(SLUG_SEPARATOR)
  if (separatorIndex === -1) {
    return refuse(`slug is missing: expected "${SLUG_SEPARATOR}" after the subcategory`)
  }
  const subcategory = categoryText.slice(0, separatorIndex)
  const slug = categoryText.slice(separatorIndex + 1)
  if (!SUBCATEGORY_PATTERN.test(subcategory)) return refuse(SUBCATEGORY_PROBLEM)
  if (slug === WILDCARD) return { ok: true, predicate: { domain, subcategory } }
  if (!SLUG_PATTERN.test(slug)) return refuse(SLUG_PROBLEM)
  return { ok: true, predicate: { domain, subcategory, slug } }
}

export function parseSocketPredicate(text: string): SocketPredicateParse {
  const separatorIndex = text.indexOf(DOMAIN_SEPARATOR)
  const domain = separatorIndex === -1 ? text : text.slice(0, separatorIndex)
  if (!isAssetDomainCode(domain)) return refuse(DOMAIN_PROBLEM)
  if (separatorIndex === -1) {
    return refuse(`subcategory is missing: expected "${DOMAIN_SEPARATOR}" after the domain`)
  }
  const rest = text.slice(separatorIndex + 1)
  if (rest === WILDCARD) return { ok: true, predicate: { domain } }
  return parseCategoryPart(domain, rest)
}

export function matchesPredicate(predicate: SocketPredicate, id: CatalogId): boolean {
  return (
    predicate.domain === id.domain &&
    (predicate.subcategory === undefined || predicate.subcategory === id.subcategory) &&
    (predicate.slug === undefined || predicate.slug === id.slug)
  )
}
