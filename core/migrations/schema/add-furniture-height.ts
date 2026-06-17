import { DEFAULT_FURNITURE_HEIGHT_MM } from '../../model/factories'
import type { ProjectShape, SchemaMigration } from '../types'

export const addFurnitureHeightMigration: SchemaMigration = {
  from: 10,
  migrate(project) {
    const floors = project.floors
    if (!Array.isArray(floors)) return project
    const migratedFloors = floors.map((floor) => {
      const floorRecord = floor as Record<string, unknown>
      const furniture = floorRecord.furniture
      if (!Array.isArray(furniture)) return floorRecord
      const migrated = furniture.map((piece) => {
        const record = piece as Record<string, unknown>
        return typeof record.height === 'number'
          ? record
          : { ...record, height: DEFAULT_FURNITURE_HEIGHT_MM }
      })
      return { ...floorRecord, furniture: migrated }
    })
    return { ...project, floors: migratedFloors } satisfies ProjectShape
  },
}
