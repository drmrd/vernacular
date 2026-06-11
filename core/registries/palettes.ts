import { colorFromHex, type NamedColor } from '../color/color'
import type { PeriodId } from '../model/types'
import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A bundled palette in the PaletteRegistry. Project-local palettes (the
 * user-editable ones) live on Project.palettes; these are the read-only seeded
 * set the picker browses (design spec 3.1 and 4.4). The optional periods hint
 * lets a later cycle bias palettes by chronological period (ADR-0046).
 */
export interface Palette extends RegistryEntry {
  displayName: Record<string, string>
  description?: string
  periods?: PeriodId[]
  colors: NamedColor[]
}

export const PALETTE_REGISTRY_VERSION = 1

/* eslint-disable @typescript-eslint/naming-convention -- BCP 47 locale keys are data, not identifiers. */
export const builtinPalettes: Registry<Palette> = createRegistry(PALETTE_REGISTRY_VERSION, [
  {
    id: 'historic-interior-neutrals',
    displayName: { 'en-US': 'Historic Interior Neutrals' },
    description: 'A neutral old-house interior palette of warm whites, putties, and soft greens.',
    periods: ['victorian', 'edwardian'],
    colors: [
      { name: 'Warm White', color: colorFromHex('#f4efe6') },
      { name: 'Putty', color: colorFromHex('#cdc2ad') },
      { name: 'Sage Green', color: colorFromHex('#9aa583') },
      { name: 'Slate Blue', color: colorFromHex('#5b6e7a') },
      { name: 'Oxblood', color: colorFromHex('#6e2b2b') },
      { name: 'Charcoal', color: colorFromHex('#33312e') },
    ],
  },
])
/* eslint-enable @typescript-eslint/naming-convention */
