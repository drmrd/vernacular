import type { SchemaMigration } from '../types'
import { addRoomOverridesMigration } from './add-room-overrides'

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [addRoomOverridesMigration]
