import { DAYLIGHT_REFERENCE_INSTANT } from './daylight-reference'
import type { ObservationInstant } from './observation-time'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import type { Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'

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

export type OpeningConditionsInput = {
  readonly site: Site | undefined
  readonly front: PlanDirection
}

export type OpeningConditions = {
  readonly observedAt: ObservationInstant
  readonly cloudCover: number
}

/**
 * The instant and the cloud cover a project opens at, for a site and the front of its house.
 * A site whose north is implied from the front opens at the fixed instant under the default
 * cloud cover.
 */
export function openingConditions(input: OpeningConditionsInput): OpeningConditions {
  return { observedAt: openingInstant({ site: input.site }), cloudCover: DEFAULT_CLOUD_COVER }
}
