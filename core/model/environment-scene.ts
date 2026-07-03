import type { Extensions } from './types'

/**
 * Non-rendering weather placeholder for an environment scene. A later slice wires a
 * turbidity or cloud-cover dial through this; today it persists verbatim and renders
 * nothing (documented like `Obstruction`).
 */
export interface WeatherConditions {
  /** Free-text summary, for example `'clear'` or `'overcast'`. Absent means unspecified. */
  summary?: string
  /** Cloud-cover fraction, 0 (clear) to 1 (fully overcast). Absent means unspecified. */
  cloudCover?: number
  /** Third-party extension data; see {@link Extensions}. */
  extensions?: Extensions
}

/**
 * A saved viewing condition: a named observation instant plus weather. Scenes reload
 * identically and can be shared, so a paint can be checked across several conditions
 * (design spec 3.1). `observedAt` is an ISO 8601 civil datetime string
 * (`YYYY-MM-DDThh:mm`) for clean JSON diffs; parse it with `parseObservationInstant`.
 */
export interface EnvironmentScene {
  id: string
  name: string
  /** ISO 8601 civil datetime `YYYY-MM-DDThh:mm`. */
  observedAt: string
  weather?: WeatherConditions
  /** Third-party extension data; see {@link Extensions}. */
  extensions?: Extensions
}
