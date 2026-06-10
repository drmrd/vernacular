import { createRegistry, type Registry, type RegistryEntry } from './registry'

/**
 * A room's primary purpose. Stored on a room as a registry id; the room's
 * optional free-text subPurpose, plus its period and style overrides, live
 * alongside it on the RoomOverride. Period-aware and style-aware library biasing
 * is a later convergence with the assets track and is not modeled here.
 */
export interface RoomPurpose extends RegistryEntry {
  /** Locale-aware display names. MVP ships en-US only (design spec 7.2). */
  displayName: Record<string, string>
}

export const ROOM_PURPOSE_REGISTRY_VERSION = 1

// The locale keys below are BCP 47 language tags (for example "en-US"); they are
// data, not identifiers, so the camelCase naming convention does not apply.
/* eslint-disable @typescript-eslint/naming-convention */
const purpose = (id: string, name: string): RoomPurpose => ({ id, displayName: { 'en-US': name } })

export const builtinRoomPurposes: Registry<RoomPurpose> = createRegistry(
  ROOM_PURPOSE_REGISTRY_VERSION,
  [
    // Common modern
    purpose('living-room', 'Living Room'),
    purpose('kitchen', 'Kitchen'),
    purpose('dining-room', 'Dining Room'),
    purpose('bedroom', 'Bedroom'),
    purpose('primary-bedroom', 'Primary Bedroom'),
    purpose('bathroom', 'Bathroom'),
    purpose('powder-room', 'Powder Room'),
    purpose('family-room', 'Family Room'),
    purpose('office', 'Office'),
    purpose('laundry', 'Laundry'),
    purpose('garage', 'Garage'),
    purpose('basement', 'Basement'),
    purpose('attic', 'Attic'),
    purpose('closet', 'Closet'),
    purpose('pantry', 'Pantry'),
    purpose('mudroom', 'Mudroom'),
    purpose('entry', 'Entry'),
    purpose('hallway', 'Hallway'),
    // Historic reception
    purpose('parlor', 'Parlor'),
    purpose('front-parlor', 'Front Parlor'),
    purpose('back-parlor', 'Back Parlor'),
    purpose('sitting-room', 'Sitting Room'),
    purpose('drawing-room', 'Drawing Room'),
    purpose('morning-room', 'Morning Room'),
    purpose('library', 'Library'),
    purpose('den', 'Den'),
    purpose('music-room', 'Music Room'),
    purpose('conservatory', 'Conservatory'),
    purpose('vestibule', 'Vestibule'),
    purpose('smoking-room', 'Smoking Room'),
    purpose('billiard-room', 'Billiard Room'),
    // Historic service
    purpose('butlers-pantry', "Butler's Pantry"),
    purpose('scullery', 'Scullery'),
    purpose('larder', 'Larder'),
    purpose('summer-kitchen', 'Summer Kitchen'),
    purpose('boot-room', 'Boot Room'),
    purpose('servants-quarters', "Servants' Quarters"),
    purpose('maids-room', "Maid's Room"),
    purpose('root-cellar', 'Root Cellar'),
    purpose('coal-cellar', 'Coal Cellar'),
    purpose('wash-house', 'Wash House'),
    // Private / transitional
    purpose('nursery', 'Nursery'),
    purpose('sewing-room', 'Sewing Room'),
    purpose('dressing-room', 'Dressing Room'),
    purpose('sleeping-porch', 'Sleeping Porch'),
    purpose('porch', 'Porch'),
    purpose('sunroom', 'Sunroom'),
    // Catch-all
    purpose('other', 'Other'),
  ],
)
/* eslint-enable @typescript-eslint/naming-convention */
