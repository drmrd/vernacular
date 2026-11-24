import { ASSET_DOMAIN_CODES, type AssetDomainCode } from '../registries/asset-domains.ts'

export interface CatalogId {
  namespace: string
  domain: AssetDomainCode
  subcategory: string
  slug: string
  version: string
}

export type CatalogIdParse = { ok: true; id: CatalogId } | { ok: false; problem: string }

const NAMESPACE = String.raw`(core|(?:org|usr|pkg)_[a-z0-9][a-z0-9-]{0,30})`
const DOMAIN = `(${ASSET_DOMAIN_CODES.join('|')})`
const SUBCATEGORY = String.raw`([a-z][a-z0-9_]{2,47})`
const SLUG = String.raw`([a-z][a-z0-9_]{1,63})`
const NUMERIC = String.raw`(?:0|[1-9][0-9]*)`
const PRERELEASE_PART = String.raw`(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`
const VERSION = String.raw`(${NUMERIC}\.${NUMERIC}\.${NUMERIC}(?:-${PRERELEASE_PART}(?:\.${PRERELEASE_PART})*)?)`

const CATALOG_ID_PATTERN = new RegExp(
  `^${NAMESPACE}:${DOMAIN}\\.${SUBCATEGORY}\\/${SLUG}@${VERSION}$`,
)

export function parseCatalogId(text: string): CatalogIdParse {
  const match = CATALOG_ID_PATTERN.exec(text)
  if (match === null) return { ok: false, problem: 'not a catalog identifier' }
  const [namespace, domain, subcategory, slug, version] = match.slice(1) as [
    string,
    string,
    string,
    string,
    string,
  ]
  return {
    ok: true,
    id: { namespace, domain: domain as AssetDomainCode, subcategory, slug, version },
  }
}
