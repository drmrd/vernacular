import { createRegistry, type Registry, type RegistryEntry } from './registry.ts'

/**
 * The asset domains, their tiers, and their dependency ranks.
 * See ADR-0234 and docs/specs/2026-11-23-asset-taxonomy.md.
 */

/** Listed in the order of the specification. */
export const ASSET_DOMAIN_CODES = Object.freeze([
  'SUB',
  'COT',
  'CLR',
  'GLZ',
  'PAT',
  'RLF',
  'WTH',
  'LGT',
  'VFX',
  'SYM',
  'MAT',
  'PRF',
  'KIT',
  'BOT',
  'LYR',
  'STR',
  'ENV',
  'INT',
  'HDW',
  'MEP',
  'NET',
  'RGH',
  'APP',
  'FFE',
  'SIT',
  'LND',
  'CTX',
  'STY',
  'SCT',
  'SYS',
] as const)

export type AssetDomainCode = (typeof ASSET_DOMAIN_CODES)[number]

export type AssetTier = 1 | 2 | 3 | 4

export interface AssetDomain extends RegistryEntry {
  id: AssetDomainCode
  name: string
  tier: AssetTier
  rank: number
}

export const ASSET_DOMAIN_REGISTRY_VERSION = 1

const domainRows: readonly [code: AssetDomainCode, name: string, tier: AssetTier, rank: number][] =
  [
    ['SUB', 'Substrates', 1, 10],
    ['COT', 'Coatings', 1, 10],
    ['CLR', 'Colors', 1, 10],
    ['GLZ', 'Glazing', 1, 10],
    ['PAT', 'Patterns', 1, 10],
    ['RLF', 'Relief', 1, 10],
    ['WTH', 'Weathering', 1, 10],
    ['LGT', 'Light', 1, 10],
    ['VFX', 'Effects', 1, 10],
    ['SYM', 'Symbols', 1, 10],
    ['MAT', 'Materials', 2, 20],
    ['PRF', 'Profiles', 2, 20],
    ['KIT', 'Kit parts', 2, 20],
    ['BOT', 'Botanical parts', 2, 20],
    ['LYR', 'Layered assemblies', 2, 25],
    ['STR', 'Structure', 3, 30],
    ['ENV', 'Envelope', 3, 30],
    ['INT', 'Interior fixed elements', 3, 30],
    ['HDW', 'Hardware', 3, 30],
    ['MEP', 'Mechanical, electrical, and plumbing fixtures', 3, 30],
    ['NET', 'Network and low-voltage devices', 3, 30],
    ['RGH', 'Rough-in runs', 3, 30],
    ['APP', 'Appliances', 3, 30],
    ['FFE', 'Furniture, furnishings, and equipment', 3, 30],
    ['SIT', 'Site elements', 3, 30],
    ['LND', 'Landscape planting', 3, 30],
    ['CTX', 'Site context', 4, 40],
    ['STY', 'Styles', 4, 45],
    ['SCT', 'Arrangement sets', 4, 48],
    ['SYS', 'Systems', 4, 48],
  ]

export const builtinAssetDomains: Registry<AssetDomain> = createRegistry(
  ASSET_DOMAIN_REGISTRY_VERSION,
  domainRows.map(([id, name, tier, rank]) => ({ id, name, tier, rank })),
)

export function isAssetDomainCode(value: string): value is AssetDomainCode {
  return (ASSET_DOMAIN_CODES as readonly string[]).includes(value)
}

const ranksByCode = Object.fromEntries(
  domainRows.map(([code, , , rank]) => [code, rank]),
) as Record<AssetDomainCode, number>

export function domainRank(code: AssetDomainCode): number {
  return ranksByCode[code]
}

export type SubcategoriesByDomain = Partial<Record<AssetDomainCode, readonly string[]>>
