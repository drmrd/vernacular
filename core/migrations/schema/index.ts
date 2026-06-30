import type { SchemaMigration } from '../types'
import { addFloorDimensionsMigration } from './add-floor-dimensions'
import { addFloorFurnitureMigration } from './add-floor-furniture'
import { addFloorOpeningsMigration } from './add-floor-openings'
import { addFurnitureHeightMigration } from './add-furniture-height'
import { addPalettesPaintAndSiteMigration } from './add-palettes-paint-and-site'
import { addPeriodAndStyleMigration } from './add-period-and-style'
import { addRoomOverridesMigration } from './add-room-overrides'
import { addStairsMigration } from './add-stairs'
import { addSiteGradeElevationMigration } from './add-site-grade-elevation'
import { addSurfaceTreatmentMigration } from './add-surface-treatment'
import { addUnderlayKindMigration } from './add-underlay-kind'
import { addWallConstructionProfileMigration } from './add-wall-construction-profile'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  addRoomOverridesMigration,
  addFloorOpeningsMigration,
  addFloorDimensionsMigration,
  addPeriodAndStyleMigration,
  addStairsMigration,
  addUnderlayKindMigration,
  addPalettesPaintAndSiteMigration,
  addSurfaceTreatmentMigration,
  addFloorFurnitureMigration,
  addFurnitureHeightMigration,
  addWallConstructionProfileMigration,
  addSiteGradeElevationMigration,
]
