import { DAYLIGHT_REFERENCE_INSTANT } from './daylight-reference'
import type { ObservationInstant } from './observation-time'
import type { Site } from '../model/site'

export type OpeningInstantInput = { readonly site: Site | undefined }

/**
 * The one place that decides the instant a session opens at. Today it returns the same
 * instant for every input. The `site` parameter is the seam for a later rule; a rule that
 * depends on the site would also need the session state, which reads this once at module
 * load with no site, to be seeded for each project.
 */
export function openingInstant(input: OpeningInstantInput): ObservationInstant {
  void input
  return DAYLIGHT_REFERENCE_INSTANT
}
