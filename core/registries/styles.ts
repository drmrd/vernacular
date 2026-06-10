import { createRegistry, type Registry, type RegistryEntry } from './registry'

/** Whether a style is an academic (high) style or a vernacular (folk) form. */
export type StyleCategory = 'academic' | 'vernacular'

/**
 * An architectural style a project, floor, or room can be tagged with. The
 * effective style resolves through the hierarchy
 * room.styleOverride ?? floor.styleOverride ?? project.style.
 *
 * Styles divide into academic high styles and vernacular folk forms. Some
 * academic styles have a recognized vernacular variant that is not a distinct
 * named style (Carpenter Gothic is vernacular Gothic Revival); those entries set
 * `hasVernacularVariant: true`, and a StyleTag referencing them may set
 * `vernacular: true` to select that variant. Named vernacular forms (Folk
 * Victorian, I-house, shotgun) are seeded directly with `category: 'vernacular'`.
 */
export interface Style extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
  category: StyleCategory
  /**
   * True when this academic style has a recognized vernacular variant selectable
   * through the StyleTag `vernacular` modifier. Meaningful only on academic
   * entries; absent (treated as false) elsewhere.
   */
  hasVernacularVariant?: boolean
}

export const STYLE_REGISTRY_VERSION = 1

// The locale keys below are BCP 47 language tags (for example "en-US"); they are
// data, not identifiers, so the camelCase naming convention does not apply.
/* eslint-disable @typescript-eslint/naming-convention */
const academic = (id: string, name: string, hasVernacularVariant?: boolean): Style => ({
  id,
  displayName: { 'en-US': name },
  category: 'academic',
  ...(hasVernacularVariant === true ? { hasVernacularVariant: true } : {}),
})

const vernacular = (id: string, name: string): Style => ({
  id,
  displayName: { 'en-US': name },
  category: 'vernacular',
})

export const builtinStyles: Registry<Style> = createRegistry(STYLE_REGISTRY_VERSION, [
  academic('georgian', 'Georgian'),
  academic('federal', 'Federal'),
  academic('greek-revival', 'Greek Revival'),
  academic('gothic-revival', 'Gothic Revival', true),
  academic('italianate', 'Italianate', true),
  academic('second-empire', 'Second Empire', true),
  academic('stick', 'Stick'),
  academic('queen-anne', 'Queen Anne'),
  academic('shingle', 'Shingle'),
  academic('romanesque-revival', 'Romanesque Revival'),
  vernacular('folk-victorian', 'Folk Victorian'),
  academic('colonial-revival', 'Colonial Revival'),
  academic('craftsman', 'Craftsman'),
  academic('bungalow', 'Bungalow'),
  academic('prairie', 'Prairie'),
  academic('foursquare', 'Foursquare'),
  academic('tudor-revival', 'Tudor Revival'),
  academic('spanish-colonial-revival', 'Spanish Colonial Revival'),
  academic('cape-cod', 'Cape Cod'),
  academic('art-deco', 'Art Deco'),
  academic('minimal-traditional', 'Minimal Traditional'),
  academic('mid-century-modern', 'Mid-Century Modern'),
  academic('ranch', 'Ranch'),
  academic('split-level', 'Split-Level'),
  academic('neo-eclectic', 'Neo-Eclectic'),
  academic('contemporary-style', 'Contemporary'),
  vernacular('hall-and-parlor', 'Hall and Parlor'),
  vernacular('i-house', 'I-House'),
  vernacular('gabled-ell', 'Gabled Ell'),
  vernacular('shotgun', 'Shotgun'),
  vernacular('saltbox', 'Saltbox'),
  academic('unknown', 'Unknown'),
])
/* eslint-enable @typescript-eslint/naming-convention */
