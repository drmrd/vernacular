import type { SchemaMigration } from '../types'
import { addFloorOpeningsMigration } from './add-floor-openings'
import { addRoomOverridesMigration } from './add-room-overrides'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
]
