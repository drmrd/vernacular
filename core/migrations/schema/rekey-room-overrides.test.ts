import { describe, expect, it } from 'vitest'
import { createWall, deriveRooms, roomKey } from '../../index'
import type { Floor, Point, ProjectShape, Wall } from '../../index'
import { rekeyRoomOverridesMigration } from './rekey-room-overrides'

const VERSION_SIXTEEN = 16

/** Footprint shared by every room this file derives, in floor-plan millimeters. */
const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000

/** Wall ids for the parlor, each carrying dashes of its own (see `dashEraKey`). */
const PARLOR_WALL_IDS = ['parlor-wall-1', 'parlor-wall-2', 'parlor-wall-3', 'parlor-wall-4']

/** Wall ids for the kitchen, a second room disjoint from the parlor. */
const KITCHEN_WALL_IDS = ['kitchen-wall-1', 'kitchen-wall-2', 'kitchen-wall-3', 'kitchen-wall-4']

const PARLOR_OVERRIDE = { name: 'Front Parlor', purpose: 'parlor' }
const KITCHEN_OVERRIDE = { name: 'Back Kitchen', purpose: 'kitchen' }

interface DocumentShape {
  meta?: { schemaVersion?: number }
  floors?: Floor[]
  roomOverrides?: Record<string, unknown>
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

/** The four corners of a room whose southwest corner sits at `origin`. */
function roomCorners(origin: Point): Point[] {
  return [
    origin,
    { x: origin.x + ROOM_WIDTH_MM, y: origin.y },
    { x: origin.x + ROOM_WIDTH_MM, y: origin.y + ROOM_DEPTH_MM },
    { x: origin.x, y: origin.y + ROOM_DEPTH_MM },
  ]
}

/** Builds one closed loop of walls, one per edge of `roomCorners(origin)`, carrying `wallIds`. */
function roomWalls(origin: Point, wallIds: readonly string[]): Wall[] {
  const corners = roomCorners(origin)
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    const id = wallIds[index]
    if (next === undefined || id === undefined) {
      throw new Error('expected a closing corner and a wall id per edge')
    }
    return createWall(corner, next, { id })
  })
}

/** The pipe key `roomKey` derives today for the single room enclosed by `walls`. */
function soleDerivedRoomKey(walls: Wall[]): string {
  const [room, ...rest] = deriveRooms(walls)
  if (room === undefined || rest.length > 0) {
    throw new Error('expected exactly one derived room')
  }
  return roomKey(room)
}

/** The dash-era key an early build would have saved for a room enclosed by `wallIds`. */
function dashEraKey(wallIds: readonly string[]): string {
  return [...wallIds].sort().join('-')
}

function makeFloor(id: string, walls: Wall[]): Floor {
  return {
    id,
    name: id,
    elevation: 0,
    defaultCeilingHeight: 2438,
    walls,
    underlays: [],
    openings: [],
    dimensions: [],
    furniture: [],
  }
}

/**
 * Builds a version-16 project document with the given floors and room overrides.
 * Returned as a plain `ProjectShape` so the migration is exercised structurally,
 * exactly as a loaded-from-disk document would arrive.
 */
function makeDocument(floors: Floor[], roomOverrides: Record<string, unknown>): ProjectShape {
  return {
    meta: {
      name: 'Rekey House',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_SIXTEEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors,
    stairs: [],
    roomOverrides,
  }
}

describe('rekey-room-overrides schema migration', () => {
  it('starts its forward step from schema version 16', () => {
    expect(rekeyRoomOverridesMigration.from).toBe(VERSION_SIXTEEN)
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const document = makeDocument([], {})

    const migrated = rekeyRoomOverridesMigration.migrate(document)

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_SIXTEEN)
  })

  it('rebinds a dash-era key that matches the wall-id vocabulary to the pipe key roomKey derives', () => {
    const walls = roomWalls({ x: 0, y: 0 }, PARLOR_WALL_IDS)
    const document = makeDocument([makeFloor('floor:ground', walls)], {
      [dashEraKey(PARLOR_WALL_IDS)]: PARLOR_OVERRIDE,
    })

    const migrated = asDocument(rekeyRoomOverridesMigration.migrate(document))

    expect(migrated.roomOverrides?.[soleDerivedRoomKey(walls)]).toEqual(PARLOR_OVERRIDE)
    expect(migrated.roomOverrides?.[dashEraKey(PARLOR_WALL_IDS)]).toBeUndefined()
  })

  it('leaves a dash-joined key that matches no wall untouched, rather than dropping it', () => {
    const walls = roomWalls({ x: 0, y: 0 }, PARLOR_WALL_IDS)
    const unmatchableKey = 'no-such-wall-a-no-such-wall-b'
    const document = makeDocument([makeFloor('floor:ground', walls)], {
      [unmatchableKey]: PARLOR_OVERRIDE,
    })

    const migrated = asDocument(rekeyRoomOverridesMigration.migrate(document))

    expect(migrated.roomOverrides?.[unmatchableKey]).toEqual(PARLOR_OVERRIDE)
  })

  it('is a no-op that returns the same document reference when overrides are already keyed with the pipe separator', () => {
    const walls = roomWalls({ x: 0, y: 0 }, PARLOR_WALL_IDS)
    const document = makeDocument([makeFloor('floor:ground', walls)], {
      [soleDerivedRoomKey(walls)]: PARLOR_OVERRIDE,
    })

    const migrated = rekeyRoomOverridesMigration.migrate(document)

    expect(migrated).toBe(document)
  })

  it('rebinds multiple dash-era overrides in the same document independently', () => {
    const parlorWalls = roomWalls({ x: 0, y: 0 }, PARLOR_WALL_IDS)
    const kitchenWalls = roomWalls({ x: 10000, y: 0 }, KITCHEN_WALL_IDS)
    const document = makeDocument([makeFloor('floor:ground', [...parlorWalls, ...kitchenWalls])], {
      [dashEraKey(PARLOR_WALL_IDS)]: PARLOR_OVERRIDE,
      [dashEraKey(KITCHEN_WALL_IDS)]: KITCHEN_OVERRIDE,
    })

    const migrated = asDocument(rekeyRoomOverridesMigration.migrate(document))

    expect(migrated.roomOverrides?.[soleDerivedRoomKey(parlorWalls)]).toEqual(PARLOR_OVERRIDE)
    expect(migrated.roomOverrides?.[soleDerivedRoomKey(kitchenWalls)]).toEqual(KITCHEN_OVERRIDE)
    expect(migrated.roomOverrides?.[dashEraKey(PARLOR_WALL_IDS)]).toBeUndefined()
    expect(migrated.roomOverrides?.[dashEraKey(KITCHEN_WALL_IDS)]).toBeUndefined()
  })

  it('pools wall ids across every floor, rebinding an override for a room on a later floor', () => {
    const distractorWalls = [createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'garage-wall-1' })]
    const parlorWalls = roomWalls({ x: 0, y: 0 }, PARLOR_WALL_IDS)
    const document = makeDocument(
      [makeFloor('floor:ground', distractorWalls), makeFloor('floor:upper', parlorWalls)],
      { [dashEraKey(PARLOR_WALL_IDS)]: PARLOR_OVERRIDE },
    )

    const migrated = asDocument(rekeyRoomOverridesMigration.migrate(document))

    expect(migrated.roomOverrides?.[soleDerivedRoomKey(parlorWalls)]).toEqual(PARLOR_OVERRIDE)
    expect(migrated.roomOverrides?.[dashEraKey(PARLOR_WALL_IDS)]).toBeUndefined()
  })
})
