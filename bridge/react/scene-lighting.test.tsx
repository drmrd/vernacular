import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeEnvironmentLighting,
  DEFAULT_CLOUD_COVER,
  daylightSiteFor,
  PLAN_DOWN,
  referenceLightingInput,
  type EnvironmentLighting,
  type ObservationInstant,
  type PlanDirection,
  type Vector3,
} from '../../core'
import { SceneLighting } from './scene-lighting'

// The engine's lighting providers and the 3D library's hooks are the collaborators of
// SceneLighting. A recording stand-in provider shows what the component hands the solar
// provider, so the test reads the lighting the view would render without a GPU.
const collaborators = vi.hoisted(() => ({
  solarUpdates: [] as unknown[],
}))

vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: { scene: object; gl: object }) => unknown) =>
    select({ scene: {}, gl: {} }),
}))

vi.mock('../../engine', () => ({
  applyToneMappingOperator: () => {},
  fitSunShadowToBounds: () => {},
  setLightingColor: () => {},
  // Class exports legitimately keep their PascalCase names in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BasicLightingProvider: class {
    apply() {}
    update() {}
    dispose() {}
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SolarLightingProvider: class {
    apply() {}
    update(_scene: unknown, lighting: unknown) {
      collaborators.solarUpdates.push(lighting)
    }
    dispose() {}
  },
}))

const OBSERVED_AT: ObservationInstant = { date: '2026-03-20', minutesSinceMidnight: 630 }
const NEUTRAL_COLOR_TEMPERATURE_K = 6500

beforeEach(() => {
  collaborators.solarUpdates.length = 0
})

afterEach(cleanup)

function sampleSiteLighting(): EnvironmentLighting {
  const daylight = daylightSiteFor(undefined, PLAN_DOWN, OBSERVED_AT.date)
  return computeEnvironmentLighting({
    latLong: daylight.latLong,
    northBearing: daylight.northBearing,
    utcOffsetMinutes: daylight.utcOffsetMinutes,
    observedAt: OBSERVED_AT,
    cloudCover: DEFAULT_CLOUD_COVER,
  })
}

function renderRealistic(front: PlanDirection, observedAt?: ObservationInstant): void {
  render(
    <SceneLighting
      colorTemperatureK={NEUTRAL_COLOR_TEMPERATURE_K}
      bounds={null}
      realistic
      site={{}}
      front={front}
      observedAt={observedAt}
    />,
  )
}

function latestSunDirection(): Vector3 | undefined {
  const latest = collaborators.solarUpdates[collaborators.solarUpdates.length - 1] as
    | EnvironmentLighting
    | undefined
  return latest?.sunDirection
}

const SIDE_FRONT: PlanDirection = { x: 1, y: 0 }

describe('SceneLighting', () => {
  it.each([
    ['no site', undefined],
    ['a site with no location', {}],
  ])('drives the realistic sun at the sample site for %s', (_name, site) => {
    render(
      <SceneLighting
        colorTemperatureK={NEUTRAL_COLOR_TEMPERATURE_K}
        bounds={null}
        realistic
        site={site}
        front={PLAN_DOWN}
        observedAt={OBSERVED_AT}
      />,
    )

    const latest = collaborators.solarUpdates[collaborators.solarUpdates.length - 1] as
      | EnvironmentLighting
      | undefined
    expect(latest?.sunDirection).toEqual(sampleSiteLighting().sunDirection)
  })

  it('turns the sample sun with a side front, whose implied north bearing is a quarter turn', () => {
    renderRealistic(SIDE_FRONT, OBSERVED_AT)
    const sideFrontSun = latestSunDirection()
    cleanup()
    collaborators.solarUpdates.length = 0
    renderRealistic(PLAN_DOWN, OBSERVED_AT)
    const planDownSun = latestSunDirection()

    const expected = computeEnvironmentLighting({
      ...referenceLightingInput(),
      northBearing: Math.PI / 2,
    }).sunDirection
    expect(sideFrontSun).toEqual(expected)
    expect(sideFrontSun).not.toEqual(planDownSun)
  })

  it('uses the opening instant when no observation instant is given', () => {
    renderRealistic(PLAN_DOWN)

    expect(latestSunDirection()).toEqual(
      computeEnvironmentLighting(referenceLightingInput()).sunDirection,
    )
  })
})
