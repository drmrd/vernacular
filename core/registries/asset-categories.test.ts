import { describe, expect, it } from 'vitest'
import {
  ASSET_CATEGORY_REGISTRY_VERSION,
  builtinAssetCategories,
  defaultCategoryName,
  WRITTEN_CATEGORY_NAMES,
} from './asset-categories.ts'
import { TIER_1_SUBCATEGORIES } from './asset-categories-tier-1.ts'
import { TIER_2_SUBCATEGORIES } from './asset-categories-tier-2.ts'
import { TIER_3_SUBCATEGORIES } from './asset-categories-tier-3.ts'
import { TIER_4_SUBCATEGORIES } from './asset-categories-tier-4.ts'
import { ASSET_DOMAIN_CODES, builtinAssetDomains } from './asset-domains.ts'
import { getEntry } from './registry.ts'

const EXPECTED_COUNTS_BY_DOMAIN = Object.fromEntries([
  ['SUB', 21],
  ['COT', 14],
  ['CLR', 10],
  ['GLZ', 11],
  ['PAT', 12],
  ['RLF', 10],
  ['WTH', 10],
  ['LGT', 8],
  ['VFX', 8],
  ['SYM', 10],
  ['MAT', 13],
  ['PRF', 13],
  ['KIT', 14],
  ['BOT', 12],
  ['LYR', 12],
  ['STR', 14],
  ['ENV', 15],
  ['INT', 15],
  ['HDW', 13],
  ['MEP', 17],
  ['NET', 11],
  ['RGH', 15],
  ['APP', 12],
  ['FFE', 19],
  ['SIT', 12],
  ['LND', 15],
  ['CTX', 15],
  ['STY', 17],
  ['SCT', 17],
  ['SYS', 25],
])

describe('builtinAssetCategories', () => {
  it('holds 410 categories with the count of each domain', () => {
    const entries = Object.values(builtinAssetCategories.entries)
    const countsByDomain: Record<string, number> = {}
    for (const entry of entries) {
      countsByDomain[entry.domain] = (countsByDomain[entry.domain] ?? 0) + 1
    }

    expect(builtinAssetCategories.version).toBe(ASSET_CATEGORY_REGISTRY_VERSION)
    expect(entries).toHaveLength(410)
    expect(countsByDomain).toEqual(EXPECTED_COUNTS_BY_DOMAIN)
    for (const entry of entries) {
      expect(entry.id).toMatch(/^[A-Z]{3}\.[a-z][a-z0-9_]{2,47}$/)
    }
    const seating = getEntry(builtinAssetCategories, 'FFE.seating')
    expect(seating?.domain).toBe('FFE')
    expect(seating?.subcategory).toBe('seating')
  })
})

describe('asset category names', () => {
  it('gives each category a display name from its id unless one is written', () => {
    expect(defaultCategoryName('window_sash_casement')).toBe('Window sash casement')
    expect(getEntry(builtinAssetCategories, 'FFE.seating')?.name).toBe('Seating')
    expect(getEntry(builtinAssetCategories, 'LGT.ies_distributions')?.name).toBe(
      'IES distributions',
    )
    expect(getEntry(builtinAssetCategories, 'LGT.hdri_environment_maps')?.name).toBe(
      'HDRI environment maps',
    )
    for (const entry of Object.values(builtinAssetCategories.entries)) {
      expect(entry.name).not.toBe('')
      expect(entry.name).not.toContain('_')
    }
  })

  it('writes names that read as English for abbreviated and run-together ids', () => {
    const expectedNames: [string, string][] = [
      ['SYM.arch_plan_symbols', 'Architectural plan symbols'],
      ['RGH.elec_cable_runs', 'Electrical cable runs'],
      ['MEP.solar_storage_ev_gen', 'Solar storage EV generation'],
      ['STY.era_pre_1840_early_american', 'Before 1840: Early American'],
      ['STY.era_1840_1900_victorian_revival', '1840 to 1900: Victorian revival'],
      ['MAT.utility_roughin_finishes', 'Utility rough-in finishes'],
      ['KIT.electrical_lowvoltage_boxes', 'Electrical low voltage boxes'],
      ['INT.built_in_kitchen_bath', 'Built-in kitchen bath'],
      ['SYS.live_telemetry_asbuilt_bindings', 'Live telemetry as-built bindings'],
      ['APP.handheld_cordless_garage_equip', 'Handheld cordless garage equipment'],
      ['FFE.window_treatments_softgoods', 'Window treatments soft goods'],
      ['NET.telecom_wan_demarc', 'Telecom WAN demarcation'],
    ]
    const unreadableWords = new RegExp(
      `\\b(${[
        'elec',
        'arch',
        'gen',
        'roughin',
        'lowvoltage',
        'softgoods',
        'floorcare',
        'greenroof',
        'raingarden',
        'rockgarden',
        'asbuilt',
        'equip',
        'demarc',
      ].join('|')})\\b|\\bbuilt in\\b`,
      'i',
    )

    for (const id of Object.keys(WRITTEN_CATEGORY_NAMES)) {
      expect(builtinAssetCategories.entries, id).toHaveProperty([id])
    }
    for (const [id, name] of expectedNames) {
      expect(getEntry(builtinAssetCategories, id)?.name, id).toBe(name)
    }
    for (const entry of Object.values(builtinAssetCategories.entries)) {
      expect(entry.name, entry.id).not.toMatch(unreadableWords)
    }
  })
})

describe('the tier files', () => {
  it('keeps each domain in the tier file of its tier', () => {
    const tierFiles = [
      TIER_1_SUBCATEGORIES,
      TIER_2_SUBCATEGORIES,
      TIER_3_SUBCATEGORIES,
      TIER_4_SUBCATEGORIES,
    ]

    tierFiles.forEach((tierFile, index) => {
      const tier = index + 1
      const domainsOfTier = ASSET_DOMAIN_CODES.filter(
        (code) => getEntry(builtinAssetDomains, code)?.tier === tier,
      )
      expect(Object.keys(tierFile), `tier ${tier}`).toEqual(domainsOfTier)
    })
  })
})
