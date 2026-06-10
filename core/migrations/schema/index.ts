import type { SchemaMigration } from '../types'
import { addFloorDimensionsMigration } from './add-floor-dimensions'
import { addFloorOpeningsMigration } from './add-floor-openings'
import { addPeriodAndStyleMigration } from './add-period-and-style'
import { addRoomOverridesMigration } from './add-room-overrides'
import { addStairsMigration } from './add-stairs'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
  addStairsMigration,
]
