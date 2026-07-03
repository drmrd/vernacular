import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addEnvironmentScenesMigration } from './add-environment-scenes'

const VERSION_FOURTEEN = 14

interface DocumentShape {
  meta?: { schemaVersion?: number }
  environmentScenes?: unknown
}

function makeVersionFourteenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_FOURTEEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    stairs: [],
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-environment-scenes schema migration', () => {
  it('starts its forward step from schema version 14', () => {
    expect(addEnvironmentScenesMigration.from).toBe(VERSION_FOURTEEN)
  })

  it('backfills an absent environmentScenes array to empty', () => {
    const migrated = addEnvironmentScenesMigration.migrate(makeVersionFourteenDocument())
    expect(asDocument(migrated).environmentScenes).toEqual([])
  })

  it('preserves an already-present environmentScenes array', () => {
    const scenes = [{ id: 's1', name: 'Noon', observedAt: '2026-06-21T12:00' }]
    const doc = { ...makeVersionFourteenDocument(), environmentScenes: scenes } as ProjectShape
    expect(asDocument(addEnvironmentScenesMigration.migrate(doc)).environmentScenes).toBe(scenes)
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addEnvironmentScenesMigration.migrate(makeVersionFourteenDocument())
    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_FOURTEEN)
  })
})
