import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addWeatherCloudCoverMigration } from './add-weather-cloud-cover'

const VERSION_FIFTEEN = 15

interface WeatherShape {
  summary?: string
  cloudCover?: number
}

interface EnvironmentSceneShape {
  id: string
  name: string
  observedAt: string
  weather?: WeatherShape
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  environmentScenes?: EnvironmentSceneShape[]
}

/**
 * Builds a version-15 project document whose environment scenes predate the
 * `weather.cloudCover` field. Returned as a plain `ProjectShape` so the migration is
 * exercised structurally, exactly as a loaded-from-disk version-15 document would arrive.
 */
function makeVersionFifteenDocument(environmentScenes: EnvironmentSceneShape[] = []): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_FIFTEEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    environmentScenes,
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-weather-cloud-cover schema migration', () => {
  it('starts its forward step from schema version 15', () => {
    expect(addWeatherCloudCoverMigration.from).toBe(VERSION_FIFTEEN)
  })

  it('leaves a scene whose weather has no cloudCover unchanged (an optional field needs no backfill)', () => {
    const doc = makeVersionFifteenDocument([
      { id: 's1', name: 'Noon', observedAt: '2026-06-21T12:00', weather: { summary: 'clear' } },
    ])

    const migrated = addWeatherCloudCoverMigration.migrate(doc)

    expect(asDocument(migrated).environmentScenes?.[0]?.weather).toEqual({ summary: 'clear' })
  })

  it('preserves a scene already carrying weather.cloudCover', () => {
    const doc = makeVersionFifteenDocument([
      {
        id: 's1',
        name: 'Overcast noon',
        observedAt: '2026-06-21T12:00',
        weather: { summary: 'overcast', cloudCover: 1 },
      },
    ])

    const migrated = addWeatherCloudCoverMigration.migrate(doc)

    expect(asDocument(migrated).environmentScenes?.[0]?.weather).toEqual({
      summary: 'overcast',
      cloudCover: 1,
    })
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addWeatherCloudCoverMigration.migrate(makeVersionFifteenDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_FIFTEEN)
  })
})
