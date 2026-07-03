import type { ObservationInstant, Site } from '../core'

/**
 * A named canonical environment for the scene harness: a fixed site, a fixed
 * observation instant, and realistic lighting on, so a harness baseline captures a
 * reproducible solar render with lighting as the only variable.
 */
export interface HarnessEnvironmentState {
  site: Site
  observedAt: ObservationInstant
  realistic: true
  cloudCover?: number
  colorCheck?: boolean
}

// The one canonical harness site (40 N, 75 W, plan-up as true north, Eastern time).
// Both named states share it so their baselines differ only in the observation instant.
const CANONICAL_SITE: Site = {
  latLong: { latitude: 40, longitude: -75 },
  northBearing: 0,
  timezone: 'America/New_York',
}

const CIVIL_NOON_MINUTES = 720
const MID_AFTERNOON_MINUTES = 960
// Fully overcast: the sky model's cloud-cover fraction saturates at 1.
const FULLY_OVERCAST_CLOUD_COVER = 1

/**
 * The named canonical environment states, keyed by the harness `scene` parameter.
 * The dates and times match the core solar reference cases (the March equinox at
 * civil noon and the December solstice in mid-afternoon), so the sun the harness
 * renders is the same sun those cases pin.
 */
// These keys share the `scene` query-param namespace with the harness geometry
// fixtures (junctions, furniture) and must stay disjoint from them (see the App).
const HARNESS_ENVIRONMENT_STATES = new Map<string, HarnessEnvironmentState>([
  [
    'equinox-noon',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: CIVIL_NOON_MINUTES },
      realistic: true,
    },
  ],
  [
    'winter-afternoon',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-12-21', minutesSinceMidnight: MID_AFTERNOON_MINUTES },
      realistic: true,
    },
  ],
  [
    'color-check',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: CIVIL_NOON_MINUTES },
      realistic: true,
      colorCheck: true,
    },
  ],
  [
    'overcast-noon',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: CIVIL_NOON_MINUTES },
      realistic: true,
      cloudCover: FULLY_OVERCAST_CLOUD_COVER,
    },
  ],
])

/** Resolves a named canonical environment state; unknown or absent names resolve to none. */
export function harnessEnvironmentState(name: string | null): HarnessEnvironmentState | undefined {
  return name === null ? undefined : HARNESS_ENVIRONMENT_STATES.get(name)
}
