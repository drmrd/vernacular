// A project document for the test that every command keeps `extensions` and
// unknown keys (design spec 2026-11-14, section 5.4). Every object whose schema
// type carries `extensions`, and the root, holds an `extensions` value and the
// unknown key `x-unknown-probe`. Most collections hold a main object and a spare
// so a sample command can remove the spare and leave the main object to check.

import { colorFromHex } from '../../color/color'
import type { EnvironmentScene } from '../../model/environment-scene'
import {
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
  createStair,
  createUnderlay,
  createFurnitureInstance,
  createWall,
} from '../../model/factories'
import { solidTreatment, surfaceKey, type SurfaceRef } from '../../model/paint'
import type { Site } from '../../model/site'
import type {
  Dimension,
  Floor,
  Opening,
  Project,
  ProjectPalette,
  RoomOverride,
  Stair,
  Underlay,
  Wall,
} from '../../model/types'

/** The unknown key the fixture plants on every object that carries `extensions`. */
export const UNKNOWN_PROBE_KEY = 'x-unknown-probe'

const EXTENSION_NAMESPACE = 'org.example.probe'

/** The ids the fixture uses, for building command parameters against it. */
export const FIXTURE_IDS = {
  groundFloor: 'floor-ground',
  upperFloor: 'floor-upper',
  mainWall: 'wall-main',
  sideWall: 'wall-side',
  mainOpening: 'opening-main',
  sideOpening: 'opening-side',
  mainUnderlay: 'underlay-main',
  spareUnderlay: 'underlay-spare',
  mainDimension: 'dimension-main',
  spareDimension: 'dimension-spare',
  furniture: 'furniture-main',
  mainStair: 'stair-main',
  spareStair: 'stair-spare',
  mainScene: 'scene-main',
  spareScene: 'scene-spare',
  mainPalette: 'palette-main',
  sparePalette: 'palette-spare',
  obstruction: 'obstruction-main',
  roomKey: 'room:wall-main|wall-side',
} as const

/** A painted surface of the fixture: the left face of the main wall. */
export const PAINTED_SURFACE: SurfaceRef = {
  kind: 'wall-face',
  wallId: FIXTURE_IDS.mainWall,
  side: 'left',
}

export const FIXTURE_PERIOD = 'victorian'
export const FIXTURE_STYLE_ID = 'queen-anne'
export const FIXTURE_DOOR_TYPE = 'single-swing-door'
export const FIXTURE_COLOR_HEX = '#9aa583'
export const FIXTURE_FINISH_ID = 'matte'

export const MAIN_WALL_LENGTH_MM = 4000
export const SIDE_WALL_LENGTH_MM = 3000
export const UPPER_FLOOR_ELEVATION_MM = 3000
const OPENING_POSITION_MM = 1500
const DIMENSION_LENGTH_MM = 2500
const DIMENSION_OFFSET_MM = 300
const UNDERLAY_WIDTH_PX = 800
const UNDERLAY_HEIGHT_PX = 600
const FURNITURE_WIDTH_MM = 900
const FURNITURE_DEPTH_MM = 600
const FURNITURE_X_MM = 2000
const FURNITURE_Y_MM = 1500
const STAIR_SPARE_X_MM = 2500
const ROOM_CEILING_HEIGHT_MM = 2900
const SITE_LATITUDE = 42.36
const SITE_LONGITUDE = -71.06
const OBSTRUCTION_EDGE_MM = 5000
const OBSTRUCTION_HEIGHT_MM = 8000
const FIXTURE_SCENE_TIME = '2026-06-21T12:00'

/** Adds an `extensions` value and the unknown probe key, both naming the carrier. */
function probed<T extends object>(value: T, carrier: string): T {
  return {
    ...value,
    extensions: { [EXTENSION_NAMESPACE]: { carrier, tags: ['kept', carrier] } },
    [UNKNOWN_PROBE_KEY]: { carrier },
  }
}

function walls(): Wall[] {
  const { mainWall, sideWall } = FIXTURE_IDS
  const origin = { x: 0, y: 0 }
  return [
    probed(createWall(origin, { x: MAIN_WALL_LENGTH_MM, y: 0 }, { id: mainWall }), mainWall),
    probed(createWall(origin, { x: 0, y: SIDE_WALL_LENGTH_MM }, { id: sideWall }), sideWall),
  ]
}

function opening(id: string, hostWallId: string, entrance?: true): Opening {
  const position = OPENING_POSITION_MM
  const created = createOpening({ type: FIXTURE_DOOR_TYPE, hostWallId, position, id })
  return probed(entrance === undefined ? created : { ...created, entrance }, id)
}

function underlay(id: string): Underlay {
  const image = { scope: 'project', contentHash: `hash-${id}` } as const
  const created = createUnderlay({ image, width: UNDERLAY_WIDTH_PX, height: UNDERLAY_HEIGHT_PX })
  return probed({ ...created, id }, id)
}

function dimension(id: string, offset: number): Dimension {
  const end = { x: DIMENSION_LENGTH_MM, y: 0 }
  return probed(createDimension({ start: { x: 0, y: 0 }, end, offset, id }), id)
}

function groundFloor(): Floor {
  const ids = FIXTURE_IDS
  const floor = createFloor('Ground', { id: ids.groundFloor, walls: walls() })
  return probed(
    {
      ...floor,
      periodOverride: FIXTURE_PERIOD,
      styleOverride: { styleId: FIXTURE_STYLE_ID },
      openings: [
        opening(ids.mainOpening, ids.mainWall, true),
        opening(ids.sideOpening, ids.sideWall),
      ],
      underlays: [underlay(ids.mainUnderlay), underlay(ids.spareUnderlay)],
      dimensions: [
        dimension(ids.mainDimension, 0),
        dimension(ids.spareDimension, DIMENSION_OFFSET_MM),
      ],
      furniture: [
        createFurnitureInstance({
          assetRef: { scope: 'user', contentHash: 'hash-furniture' },
          position: { x: FURNITURE_X_MM, y: FURNITURE_Y_MM },
          footprint: { width: FURNITURE_WIDTH_MM, depth: FURNITURE_DEPTH_MM },
          id: ids.furniture,
        }),
      ],
    },
    ids.groundFloor,
  )
}

function upperFloor(): Floor {
  const { upperFloor: id } = FIXTURE_IDS
  return probed(createFloor('Upper', { id, elevation: UPPER_FLOOR_ELEVATION_MM }), id)
}

function stair(id: string, x: number): Stair {
  const connection = { fromFloorId: FIXTURE_IDS.groundFloor, toFloorId: FIXTURE_IDS.upperFloor }
  return probed(createStair({ connection, position: { x, y: 0 }, id }), id)
}

function scene(id: string): EnvironmentScene {
  const weather = probed({ summary: 'clear', cloudCover: 0 }, `${id}/weather`)
  return probed({ id, name: `Scene ${id}`, observedAt: FIXTURE_SCENE_TIME, weather }, id)
}

function palette(id: string): ProjectPalette {
  const colors = [{ name: 'Sage', color: colorFromHex(FIXTURE_COLOR_HEX) }]
  return probed({ id, name: `Palette ${id}`, periods: [FIXTURE_PERIOD], colors }, id)
}

function roomOverride(): RoomOverride {
  const override: RoomOverride = {
    name: 'Parlor',
    purpose: 'parlor',
    subPurpose: 'Front parlor',
    periodOverride: FIXTURE_PERIOD,
    styleOverride: { styleId: FIXTURE_STYLE_ID },
    ceilingHeight: ROOM_CEILING_HEIGHT_MM,
  }
  return probed(override, FIXTURE_IDS.roomKey)
}

function site(): Site {
  const edge = OBSTRUCTION_EDGE_MM
  const footprint = [
    { x: 0, y: 0 },
    { x: edge, y: 0 },
    { x: edge, y: edge },
  ]
  return {
    latLong: { latitude: SITE_LATITUDE, longitude: SITE_LONGITUDE },
    northBearing: 0,
    obstructions: [{ id: FIXTURE_IDS.obstruction, footprint, height: OBSTRUCTION_HEIGHT_MM }],
    timezone: 'America/New_York',
  }
}

/** A fresh fixture document; every call returns a new, unshared object graph. */
export function createExtensionsFixture(): Project {
  const ids = FIXTURE_IDS
  const empty = createEmptyProject({
    name: 'Probe house',
    units: 'metric',
    period: FIXTURE_PERIOD,
    style: { styleId: FIXTURE_STYLE_ID },
    appVersion: '0.0.0',
  })
  return probed(
    {
      ...empty,
      meta: probed(empty.meta, 'meta'),
      floors: [groundFloor(), upperFloor()],
      stairs: [stair(ids.mainStair, 0), stair(ids.spareStair, STAIR_SPARE_X_MM)],
      environmentScenes: [scene(ids.mainScene), scene(ids.spareScene)],
      roomOverrides: { [ids.roomKey]: roomOverride() },
      palettes: [palette(ids.mainPalette), palette(ids.sparePalette)],
      paint: {
        [surfaceKey(PAINTED_SURFACE)]: solidTreatment(
          colorFromHex(FIXTURE_COLOR_HEX),
          FIXTURE_FINISH_ID,
        ),
      },
      site: site(),
    },
    'root',
  )
}
