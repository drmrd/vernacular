import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A chronological period a project, floor, or room can be tagged with. The
 * effective period resolves through the hierarchy
 * room.periodOverride ?? floor.periodOverride ?? project.period; see the design
 * specification, section 3.2 (which describes this as the era hierarchy; period
 * and style are the two axes that concept is realized as).
 */
export interface Period extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
  /** Human-readable approximate date span, for example "c. 1837-1901". */
  approximateRange: string
}

export const PERIOD_REGISTRY_VERSION = 1

// The locale keys below are BCP 47 language tags (for example "en-US"); they are
// data, not identifiers, so the camelCase naming convention does not apply.
/* eslint-disable @typescript-eslint/naming-convention */
export const builtinPeriods: Registry<Period> = createRegistry(PERIOD_REGISTRY_VERSION, [
  { id: 'colonial', displayName: { 'en-US': 'Colonial' }, approximateRange: 'c. 1600-1780' },
  {
    id: 'early-republic',
    displayName: { 'en-US': 'Early Republic' },
    approximateRange: 'c. 1780-1830',
  },
  { id: 'antebellum', displayName: { 'en-US': 'Antebellum' }, approximateRange: 'c. 1830-1860' },
  { id: 'victorian', displayName: { 'en-US': 'Victorian' }, approximateRange: 'c. 1837-1901' },
  { id: 'edwardian', displayName: { 'en-US': 'Edwardian' }, approximateRange: 'c. 1901-1918' },
  { id: 'interwar', displayName: { 'en-US': 'Interwar' }, approximateRange: 'c. 1918-1945' },
  { id: 'postwar', displayName: { 'en-US': 'Postwar' }, approximateRange: 'c. 1945-1970' },
  {
    id: 'contemporary',
    displayName: { 'en-US': 'Contemporary' },
    approximateRange: 'c. 1970-present',
  },
  { id: 'unknown', displayName: { 'en-US': 'Unknown' }, approximateRange: 'Unknown' },
])
/* eslint-enable @typescript-eslint/naming-convention */
