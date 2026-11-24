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
  name: string
}

export const ASSET_CATEGORY_REGISTRY_VERSION = 1

/* eslint-disable @typescript-eslint/naming-convention -- category ids are data, not identifiers. */
const WRITTEN_NAMES: Readonly<Record<string, string>> = {
  'LGT.hdri_environment_maps': 'HDRI environment maps',
  'LGT.ies_distributions': 'IES distributions',
  'VFX.fault_diagnostic_fx': 'Fault diagnostic FX',
  'SYM.plumbing_hvac_symbols': 'Plumbing HVAC symbols',
  'KIT.mep_radiator_sections': 'MEP radiator sections',
  'MEP.solar_storage_ev_gen': 'Solar storage EV gen',
  'MEP.hvac_plant_equipment': 'HVAC plant equipment',
  'MEP.hvac_terminals_stoves': 'HVAC terminals stoves',
  'NET.telecom_wan_demarc': 'Telecom WAN demarc',
  'NET.distributed_av_lowvoltage': 'Distributed AV low voltage',
  'NET.rf_radio_cellular_boosters': 'RF radio cellular boosters',
  'RGH.plumbing_dwv_runs': 'Plumbing DWV runs',
  'RGH.hvac_ductwork_linesets': 'HVAC ductwork linesets',
  'APP.consumer_av_media': 'Consumer AV media',
  'CTX.geospatial_dem_imagery': 'Geospatial DEM imagery',
  'SYS.hvac_air_distribution_graphs': 'HVAC air distribution graphs',
  'SYS.plumbing_dwv_venting_trees': 'Plumbing DWV venting trees',
  'SYS.data_poe_network_topologies': 'Data PoE network topologies',
  'SYS.rf_wireless_mesh_graphs': 'RF wireless mesh graphs',
  'SYS.iaq_contaminants_hazmat': 'IAQ contaminants hazmat',
}
/* eslint-enable @typescript-eslint/naming-convention */

export function defaultCategoryName(subcategory: string): string {
  const spaced = subcategory.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const subcategoriesByDomain: Readonly<Record<AssetDomainCode, readonly string[]>> = {
  ...TIER_1_SUBCATEGORIES,
  ...TIER_2_SUBCATEGORIES,
  ...TIER_3_SUBCATEGORIES,
  ...TIER_4_SUBCATEGORIES,
}

const categories: readonly AssetCategory[] = ASSET_DOMAIN_CODES.flatMap((domain) =>
  subcategoriesByDomain[domain].map((subcategory) => {
    const id = `${domain}.${subcategory}`
    return { id, domain, subcategory, name: WRITTEN_NAMES[id] ?? defaultCategoryName(subcategory) }
  }),
)

export const builtinAssetCategories: Registry<AssetCategory> = createRegistry(
  ASSET_CATEGORY_REGISTRY_VERSION,
  categories,
)
