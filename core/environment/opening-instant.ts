import { DAYLIGHT_REFERENCE_INSTANT } from './daylight-reference'
import type { ObservationInstant } from './observation-time'
import type { Site } from '../model/site'

export type OpeningInstantInput = { readonly site: Site | undefined }

/**
 * The one place that decides the instant a session opens at. Today the answer does not
 * depend on the site; the parameter is the seam for a later design in which it may (the
 * opening light may become stored state).
 */
export function openingInstant(input: OpeningInstantInput): ObservationInstant {
  void input
  return DAYLIGHT_REFERENCE_INSTANT
}
