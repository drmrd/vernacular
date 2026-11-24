import { ASSET_DOMAIN_CODES, type AssetDomainCode } from './asset-domains.ts'
import { TIER_1_SUBCATEGORIES } from './asset-categories-tier-1.ts'
import { TIER_2_SUBCATEGORIES } from './asset-categories-tier-2.ts'
import { TIER_3_SUBCATEGORIES } from './asset-categories-tier-3.ts'
import { TIER_4_SUBCATEGORIES } from './asset-categories-tier-4.ts'
import { createRegistry, type Registry, type RegistryEntry } from './registry.ts'

/**
 * The asset categories: every subcategory of every asset domain.
 * See ADR-0234 and docs/specs/2026-11-23-asset-taxonomy.md.
 */

export interface AssetCategory extends RegistryEntry {
  id: string
  domain: AssetDomainCode
  subcategory: string
}

export const ASSET_CATEGORY_REGISTRY_VERSION = 1

const subcategoriesByDomain: Readonly<Partial<Record<AssetDomainCode, readonly string[]>>> = {
  ...TIER_1_SUBCATEGORIES,
  ...TIER_2_SUBCATEGORIES,
  ...TIER_3_SUBCATEGORIES,
  ...TIER_4_SUBCATEGORIES,
}

const categories: readonly AssetCategory[] = ASSET_DOMAIN_CODES.flatMap((domain) =>
  (subcategoriesByDomain[domain] ?? []).map((subcategory) => ({
    id: `${domain}.${subcategory}`,
    domain,
    subcategory,
  })),
)

export const builtinAssetCategories: Registry<AssetCategory> = createRegistry(
  ASSET_CATEGORY_REGISTRY_VERSION,
  categories,
)
