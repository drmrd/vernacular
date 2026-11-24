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
export const WRITTEN_CATEGORY_NAMES: Readonly<Record<string, string>> = {
  'LGT.hdri_environment_maps': 'HDRI environment maps',
  'LGT.ies_distributions': 'IES distributions',
  'VFX.fault_diagnostic_fx': 'Fault diagnostic FX',
  'SYM.plumbing_hvac_symbols': 'Plumbing HVAC symbols',
  'KIT.mep_radiator_sections': 'MEP radiator sections',
  'MEP.solar_storage_ev_gen': 'Solar storage EV generation',
  'MEP.hvac_plant_equipment': 'HVAC plant equipment',
  'MEP.hvac_terminals_stoves': 'HVAC terminals stoves',
  'NET.telecom_wan_demarc': 'Telecom WAN demarcation',
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
  'SYM.arch_plan_symbols': 'Architectural plan symbols',
  'MAT.utility_roughin_finishes': 'Utility rough-in finishes',
  'PRF.conveyance_roughin_sections': 'Conveyance rough-in sections',
  'KIT.roughin_fittings_connectors': 'Rough-in fittings connectors',
  'KIT.electrical_lowvoltage_boxes': 'Electrical low voltage boxes',
  'KIT.furniture_softgoods_parts': 'Furniture soft goods parts',
  'INT.built_in_kitchen_bath': 'Built-in kitchen bath',
  'INT.built_in_living_storage': 'Built-in living storage',
  'INT.historic_specialty_built_ins': 'Historic specialty built-ins',
  'INT.specialty_room_built_ins': 'Specialty room built-ins',
  'INT.accessibility_mobility_built_ins': 'Accessibility mobility built-ins',
  'INT.utility_access_service_built_ins': 'Utility access service built-ins',
  'RGH.elec_cable_runs': 'Electrical cable runs',
  'RGH.elec_conduit_boxes': 'Electrical conduit boxes',
  'RGH.lowvoltage_data_cabling': 'Low voltage data cabling',
  'RGH.elec_grounding_bonding': 'Electrical grounding bonding',
  'APP.floorcare_portable_climate': 'Floor care portable climate',
  'APP.handheld_cordless_garage_equip': 'Handheld cordless garage equipment',
  'FFE.window_treatments_softgoods': 'Window treatments soft goods',
  'LND.aquatic_wetland_raingarden': 'Aquatic wetland rain garden',
  'LND.arid_xeriscape_rockgarden': 'Arid xeriscape rock garden',
  'LND.greenroof_living_walls': 'Green roof living walls',
  'CTX.municipal_utility_demarc': 'Municipal utility demarcation',
  'STY.era_pre_1840_early_american': 'Before 1840: Early American',
  'STY.era_1840_1900_victorian_revival': '1840 to 1900: Victorian revival',
  'STY.era_1900_1945_eclectic_crafts': '1900 to 1945: Eclectic crafts',
  'STY.era_1945_1985_midcentury_postwar': '1945 to 1985: Midcentury postwar',
  'STY.era_1985_present_contemporary': '1985 to present: Contemporary',
  'SCT.window_softgoods_ensembles': 'Window soft goods ensembles',
  'SYS.live_telemetry_asbuilt_bindings': 'Live telemetry as-built bindings',
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
    return {
      id,
      domain,
      subcategory,
      name: WRITTEN_CATEGORY_NAMES[id] ?? defaultCategoryName(subcategory),
    }
  }),
)

export const builtinAssetCategories: Registry<AssetCategory> = createRegistry(
  ASSET_CATEGORY_REGISTRY_VERSION,
  categories,
)
