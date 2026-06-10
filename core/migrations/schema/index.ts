import type { SchemaMigration } from '../types'
import { addFloorDimensionsMigration } from './add-floor-dimensions'
import { addFloorOpeningsMigration } from './add-floor-openings'
import { addPalettesPaintAndSiteMigration } from './add-palettes-paint-and-site'
import { addPeriodAndStyleMigration } from './add-period-and-style'
import { addRoomOverridesMigration } from './add-room-overrides'
import { addStairsMigration } from './add-stairs'
import { addUnderlayKindMigration } from './add-underlay-kind'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
  addStairsMigration,
  addUnderlayKindMigration,
  addPalettesPaintAndSiteMigration,
]
