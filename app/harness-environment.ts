import type { HarnessScene } from '../bridge'
import type { CameraPose, ObservationInstant, Site } from '../core'
import { openingInstant, referenceLightingInput } from '../core'

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
// Every named state shares it except two: daylight-reference uses
// DAYLIGHT_REFERENCE_SITE below, and sample-daylight has no site.
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

// 19:05 Eastern, shortly before sunset at the canonical site on the low-sun date.
const LOW_SUN_EVENING_MINUTES = 1145

// The March-equinox-at-civil-noon instant, shared by the equinox-noon, color-check,
// color-accuracy, finish-contrast, overcast-noon, and ambient-occlusion states: all six
// pin the same sun and differ only in cloud cover, the color-check flag, the paired
// scene fixture, or the camera pose, so they share one observation instant.
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

// The shadow-on-lawn state looks from the north and above, back toward the shell, down at
// the lawn north of the shell's north wall (plan y 3000 maps to world z -3000, so the lawn
// begins past z -3060). The target stands on the ground 4.2 m north of the plan origin, where
// the north wall's noon shadow falls (about 2.2 m north and 1.0 m west of the wall). The
// frame keeps lit lawn past the shadow's tip, so a longer shadow still fits.
const SHADOW_ON_LAWN_CAMERA_POSE: CameraPose = {
  position: { x: 1500, y: 7000, z: -8500 },
  target: { x: 1500, y: 0, z: -4200 },
  near: 100,
  far: 40000,
}

// The reference instant of the daylight calibration: the place and instant that core states
// for the calibration (read here from its reference lighting input, so they are written once),
// with plan-up as true north and UTC. It sets no cloud cover, so the default of 0 applies and
// the sky is clear. The camera looks from the south-west, so the frame shows the sunlit south
// wall (the front, by its door) and the west wall in shade.
const DAYLIGHT_REFERENCE_LIGHTING = referenceLightingInput()
const DAYLIGHT_REFERENCE_SITE: Site = {
  latLong: DAYLIGHT_REFERENCE_LIGHTING.latLong,
  northBearing: DAYLIGHT_REFERENCE_LIGHTING.northBearing,
  timezone: 'UTC',
}
const DAYLIGHT_REFERENCE_CAMERA_POSE: CameraPose = {
  position: { x: -4500, y: 3200, z: 5000 },
  target: { x: 2000, y: 1300, z: -1500 },
  near: 100,
  far: 40000,
}

// The color-accuracy gate samples the shell floor under the color-check reference lighting,
// but the shell is a closed box (floor, four walls, and a ceiling), so the exterior auto-frame
// hides the floor. This interior camera stands just under the 2600 mm ceiling directly above
// the floor centre (world (2000, 0, -1500); planToWorld maps plan (x, y) to world (x, height,
// -y)) and looks straight down, with north as screen-up so the look direction is not parallel
// to the default up vector. The floor fills the canvas, so a centre sample patch is
// unambiguously floor. The camera differs from the color-check state, but the reference
// lighting (ADR-0156) is unchanged; see ADR-0157.
const COLOR_ACCURACY_CAMERA_POSE: CameraPose = {
  position: { x: 2000, y: 2400, z: -1500 },
  target: { x: 2000, y: 0, z: -1500 },
  up: { x: 0, y: 0, z: -1 },
  near: 100,
  far: 10000,
}

// The color-accuracy and finish-contrast states render the same interior shell under the
// same color-check reference lighting (ADR-0156, ADR-0157); only the sampled surface and
// therefore the camera pose differ between them, and the lane's plan reserves the right to
// tune finish-contrast's pose independently if the shared pose shows no specular lobe. So
// this constant carries every field the two states share, and each map entry below still
// states its own cameraPose.
const COLOR_ACCURACY_LIGHTING: Omit<HarnessEnvironmentState, 'cameraPose'> = {
  site: CANONICAL_SITE,
  observedAt: EQUINOX_NOON_OBSERVATION,
  realistic: true,
  colorCheck: true,
  scene: 'shell',
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
      scene: 'shell-south-window',
    },
  ],
  [
    'winter-afternoon',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-12-21', minutesSinceMidnight: MID_AFTERNOON_MINUTES },
      realistic: true,
      scene: 'shell-south-window',
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
    'color-accuracy',
    {
      ...COLOR_ACCURACY_LIGHTING,
      cameraPose: COLOR_ACCURACY_CAMERA_POSE,
    },
  ],
  [
    'finish-contrast',
    {
      ...COLOR_ACCURACY_LIGHTING,
      cameraPose: COLOR_ACCURACY_CAMERA_POSE,
    },
  ],
  [
    'overcast-noon',
    {
      site: CANONICAL_SITE,
      observedAt: EQUINOX_NOON_OBSERVATION,
      realistic: true,
      cloudCover: FULLY_OVERCAST_CLOUD_COVER,
      scene: 'shell-south-window',
    },
  ],
  [
    'shadow-on-lawn',
    {
      site: CANONICAL_SITE,
      observedAt: EQUINOX_NOON_OBSERVATION,
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: SHADOW_ON_LAWN_CAMERA_POSE,
    },
  ],
  [
    'daylight-reference',
    {
      site: DAYLIGHT_REFERENCE_SITE,
      observedAt: DAYLIGHT_REFERENCE_LIGHTING.observedAt,
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: DAYLIGHT_REFERENCE_CAMERA_POSE,
    },
  ],
  // On this evening the sun stands about 1.5 degrees above the horizon, a little north of
  // due west, so the west wall faces a sun just above the horizon and the south wall is in
  // shade; a pixel gate reads that a low sun adds almost no light. The south-west camera of
  // the reference state shows both walls.
  [
    'low-sun',
    {
      site: CANONICAL_SITE,
      observedAt: { date: '2026-03-25', minutesSinceMidnight: LOW_SUN_EVENING_MINUTES },
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: DAYLIGHT_REFERENCE_CAMERA_POSE,
    },
  ],
  // A project with no site renders sample daylight: the sample place, with north implied so
  // that the front (the wall with the door) faces due south. It shares the camera of the
  // reference state, so its sunlit front can be compared with the reference frame.
  [
    'sample-daylight',
    {
      site: {},
      observedAt: openingInstant({ site: undefined }),
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: DAYLIGHT_REFERENCE_CAMERA_POSE,
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
