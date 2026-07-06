import type { HarnessScene } from '../bridge'
import type { CameraPose, ObservationInstant, Site } from '../core'

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
  // The harness geometry fixture this environment pairs with (e.g. 'furniture' for
  // the ambient-occlusion baseline), so a single `?scene=` name selects both the
  // lighting and the geometry it should light.
  scene?: HarnessScene
  // The pose a state supplies when the default auto-frame would not expose its
  // subject (e.g. an interior view through a window). When a state supplies one,
  // the harness view uses it in preference to the standing auto-frame.
  cameraPose?: CameraPose
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
// 09:00 Eastern, the summer-solstice reference instant from
// core/environment/solar-position.test.ts, where the sun sits due east (azimuth
// ~89 deg, altitude ~37 deg).
const WINDOW_LIGHT_MORNING_MINUTES = 540

// The March-equinox-at-civil-noon instant, shared by the equinox-noon, color-check,
// overcast-noon, and ambient-occlusion states: all four pin the same sun and differ
// only in cloud cover, the color-check flag, or the paired scene fixture, so they
// share one observation instant.
const EQUINOX_NOON_OBSERVATION: ObservationInstant = {
  date: '2026-03-20',
  minutesSinceMidnight: CIVIL_NOON_MINUTES,
}

// The shell fixture's only window sits in the east wall, and the shared
// equinox-noon instant above puts the sun almost due south, which grazes that
// wall and casts no window shadow. This instant instead puts the sun due east,
// so the window-light state actually shows daylight through the glass.
const WINDOW_LIGHT_OBSERVATION: ObservationInstant = {
  date: '2026-06-21',
  minutesSinceMidnight: WINDOW_LIGHT_MORNING_MINUTES,
}

// The shell room is a 4000 x 3000 mm plan rectangle; planToWorld maps plan (x, y)
// to world (x, height, -y). The east-wall window is centered at plan (4000, 1500),
// with glass from 900 to 2100 mm up. This vantage stands inside the room, west of
// and below the window head, aimed east and slightly down, so the window (with the
// sun beyond it) and the floor just inside the sill are both in frame at 320x240.
// Starting values only; tuned against the capture in a later task.
const WINDOW_LIGHT_CAMERA_POSE: CameraPose = {
  position: { x: 500, y: 1900, z: -1500 },
  target: { x: 3000, y: 600, z: -1500 },
  near: 100,
  far: 10000,
}

/**
 * The named canonical environment states, keyed by the harness `scene` parameter.
 * Each state's date and time match a core solar reference case (the March equinox
 * at civil noon, the December solstice in mid-afternoon, or the June solstice
 * morning), so the sun the harness renders is the same sun those cases pin.
 */
// These keys share the `scene` query-param namespace with HARNESS_GEOMETRY_SCENE_KEYS
// below; see resolveHarnessScene for the shared keyspace and resolution precedence.
const HARNESS_ENVIRONMENT_STATES = new Map<string, HarnessEnvironmentState>([
  [
    'equinox-noon',
    {
      site: CANONICAL_SITE,
      observedAt: EQUINOX_NOON_OBSERVATION,
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
      observedAt: EQUINOX_NOON_OBSERVATION,
      realistic: true,
      colorCheck: true,
    },
  ],
  [
    'overcast-noon',
    {
      site: CANONICAL_SITE,
      observedAt: EQUINOX_NOON_OBSERVATION,
      realistic: true,
      cloudCover: FULLY_OVERCAST_CLOUD_COVER,
    },
  ],
  [
    'ambient-occlusion',
    {
      site: CANONICAL_SITE,
      observedAt: EQUINOX_NOON_OBSERVATION,
      realistic: true,
      scene: 'furniture',
    },
  ],
  [
    'window-light',
    {
      site: CANONICAL_SITE,
      observedAt: WINDOW_LIGHT_OBSERVATION,
      realistic: true,
      scene: 'shell',
      cameraPose: WINDOW_LIGHT_CAMERA_POSE,
    },
  ],
])

/** Resolves a named canonical environment state; unknown or absent names resolve to none. */
export function harnessEnvironmentState(name: string | null): HarnessEnvironmentState | undefined {
  return name === null ? undefined : HARNESS_ENVIRONMENT_STATES.get(name)
}

/**
 * The harness geometry fixture keys the `?scene=` query param can name directly
 * (`?fixture=scene-harness&scene=junctions` and friends): `junctions` renders the
 * T-junction and acute-bay fixture (ADR-0080), `furniture` renders the wall shell with
 * one massing box (ADR-0094), and `adjacent-rooms` renders two rooms sharing a wall,
 * viewed from below, for the shared-slab-boundary baseline (ADR-0150).
 */
export const HARNESS_GEOMETRY_SCENE_KEYS: readonly HarnessScene[] = [
  'junctions',
  'furniture',
  'adjacent-rooms',
]

/**
 * Resolves the harness `?scene=` query param for both the geometry fixture it may
 * name directly and the environment state it may name instead, in one place, so the
 * param is parsed exactly one way. The `scene` param shares one namespace between the
 * geometry fixture keys above and the named environment state keys in
 * `HARNESS_ENVIRONMENT_STATES`; the two key sets must stay disjoint (this module's
 * tests pin that), so a name is never ambiguous between the two.
 *
 * Precedence: a name that is one of the geometry keys resolves to that geometry
 * fixture directly. Otherwise, a name that is a named environment state resolves to
 * the geometry fixture that state pairs with (e.g. `ambient-occlusion` pairs with
 * `furniture`), or to none if that state carries no paired fixture. An unknown or
 * absent name resolves to none.
 */
export function resolveHarnessScene(sceneParam: string | undefined): HarnessScene | undefined {
  for (const geometryKey of HARNESS_GEOMETRY_SCENE_KEYS) {
    if (geometryKey === sceneParam) {
      return geometryKey
    }
  }
  return harnessEnvironmentState(sceneParam ?? null)?.scene
}
