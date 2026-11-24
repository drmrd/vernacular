import { isAssetDomainCode, type AssetDomainCode } from '../registries/asset-domains.ts'
import {
  DOMAIN_PROBLEM,
  SEPARATOR_AFTER_DOMAIN,
  SLUG_PATTERN,
  SLUG_PROBLEM,
  SEPARATOR_AFTER_SUBCATEGORY,
  SUBCATEGORY_PATTERN,
  SUBCATEGORY_PROBLEM,
  missingPartProblem,
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

function refuse(problem: string): SocketPredicateParse {
  return { ok: false, problem }
}

function parseSubcategoryAndSlug(
  domain: AssetDomainCode,
  categoryText: string,
): SocketPredicateParse {
  const separatorIndex = categoryText.indexOf(SEPARATOR_AFTER_SUBCATEGORY)
  if (separatorIndex === -1) {
    return refuse(
      SUBCATEGORY_PATTERN.test(categoryText)
        ? missingPartProblem('slug', SEPARATOR_AFTER_SUBCATEGORY, 'subcategory')
        : SUBCATEGORY_PROBLEM,
    )
  }
  const subcategory = categoryText.slice(0, separatorIndex)
  const slug = categoryText.slice(separatorIndex + 1)
  if (!SUBCATEGORY_PATTERN.test(subcategory)) return refuse(SUBCATEGORY_PROBLEM)
  if (slug === WILDCARD) return { ok: true, predicate: { domain, subcategory } }
  if (!SLUG_PATTERN.test(slug)) return refuse(SLUG_PROBLEM)
  return { ok: true, predicate: { domain, subcategory, slug } }
}

export function parseSocketPredicate(text: string): SocketPredicateParse {
  const separatorIndex = text.indexOf(SEPARATOR_AFTER_DOMAIN)
  const domain = separatorIndex === -1 ? text : text.slice(0, separatorIndex)
  if (!isAssetDomainCode(domain)) return refuse(DOMAIN_PROBLEM)
  if (separatorIndex === -1) {
    return refuse(missingPartProblem('subcategory', SEPARATOR_AFTER_DOMAIN, 'domain'))
  }
  const rest = text.slice(separatorIndex + 1)
  if (rest === WILDCARD) return { ok: true, predicate: { domain } }
  return parseSubcategoryAndSlug(domain, rest)
}

export function matchesPredicate(predicate: SocketPredicate, id: CatalogId): boolean {
  return (
    predicate.domain === id.domain &&
    (predicate.subcategory === undefined || predicate.subcategory === id.subcategory) &&
    (predicate.slug === undefined || predicate.slug === id.slug)
  )
}
