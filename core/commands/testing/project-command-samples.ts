// Sample parameters for the commands that act on the project as a whole: the
// project and its list of floors, palettes, rooms, stairs, paint, the site, the
// environment scenes, and the opening light. Built against the ids of the
// extensions fixture.

import { colorFromHex } from '../../color/color'
import { createStair } from '../../model/factories'
import { solidTreatment } from '../../model/paint'
import type { Project } from '../../model/types'
import * as scenes from '../handlers/environment-scene-commands'
import * as entrance from '../handlers/entrance-commands'
import * as lights from '../handlers/opening-light-commands'
import * as paint from '../handlers/paint-commands'
import * as palettes from '../handlers/palette-commands'
import * as projects from '../handlers/project-commands'
import * as rooms from '../handlers/room-commands'
import * as sites from '../handlers/site-commands'
import * as stairs from '../handlers/stair-commands'
import {
  FIXTURE_COLOR_HEX,
  FIXTURE_FINISH_ID,
  FIXTURE_IDS,
  PAINTED_SURFACE,
  UPPER_FLOOR_ELEVATION_MM,
} from './extensions-fixture'

/** Builds the parameters of one command type against a fixture document. */
export type CommandSample = (project: Project) => unknown

/** Sample parameters keyed by command type. */
export type CommandSamples = Readonly<Record<string, CommandSample>>

const ids = FIXTURE_IDS
const NEW_CEILING_HEIGHT_MM = 2700
const ELEVATION_STEP_MM = 200
const NEW_UPPER_ELEVATION_MM = UPPER_FLOOR_ELEVATION_MM + ELEVATION_STEP_MM
const STAIR_POSITION_MM = 600
const STAIR_ROTATION_RADIANS = Math.PI / 2
const NORTH_BEARING_RADIANS = 0.785
const SITE_LATITUDE = 40.71
const SITE_LONGITUDE = -74.01
const OBSTRUCTION_EDGE_MM = 3000
const OBSTRUCTION_HEIGHT_MM = 6000
const ROOM_POLYGON_EDGE_MM = 2500

const PROJECT_SAMPLES: CommandSamples = {
  [projects.RENAME_PROJECT]: () => projects.renameProject('Renamed house').params,
  [projects.SET_UNITS]: () => projects.setUnits('imperial').params,
  [projects.ADD_FLOOR]: () => projects.addFloor('Attic').params,
  [projects.REMOVE_FLOOR]: () => projects.removeFloor(ids.upperFloor).params,
  [projects.RENAME_FLOOR]: () => projects.renameFloor(ids.groundFloor, 'Main floor').params,
  [projects.REORDER_FLOOR]: () => projects.reorderFloor(ids.upperFloor, 0).params,
  [projects.SET_FLOOR_CEILING_HEIGHT]: () =>
    projects.setFloorCeilingHeight(ids.groundFloor, NEW_CEILING_HEIGHT_MM).params,
  [projects.SET_FLOOR_ELEVATION]: () =>
    projects.setFloorElevation(ids.upperFloor, NEW_UPPER_ELEVATION_MM).params,
  [projects.SET_FLOOR_PERIOD]: () => projects.setFloorPeriod(ids.groundFloor, undefined).params,
  [projects.SET_FLOOR_STYLE]: () => projects.setFloorStyle(ids.groundFloor, undefined).params,
  [projects.SET_PROJECT_PERIOD]: () => projects.setProjectPeriod('edwardian').params,
  [projects.SET_PROJECT_STYLE]: () => projects.setProjectStyle(undefined).params,
}

const ENTRANCE_SAMPLES: CommandSamples = {
  [entrance.MARK_MAIN_ENTRANCE]: () =>
    entrance.markMainEntrance(ids.groundFloor, ids.sideOpening).params,
  [entrance.CLEAR_MAIN_ENTRANCE]: () => entrance.clearMainEntrance().params,
}

const PALETTE_SAMPLES: CommandSamples = {
  [palettes.CREATE_PROJECT_PALETTE]: () =>
    palettes.createProjectPalette({ id: 'palette-added', name: 'Added palette' }).params,
  [palettes.REMOVE_PROJECT_PALETTE]: () => palettes.removeProjectPalette(ids.sparePalette).params,
  [palettes.RENAME_PROJECT_PALETTE]: () =>
    palettes.renameProjectPalette(ids.mainPalette, 'Parlor colors').params,
  [palettes.ADD_PALETTE_COLOR]: () =>
    palettes.addPaletteColor(ids.mainPalette, { name: 'Ochre', color: colorFromHex('#c8a04a') })
      .params,
  [palettes.REMOVE_PALETTE_COLOR]: () => palettes.removePaletteColor(ids.mainPalette, 0).params,
}

const ROOM_POLYGON = [
  { x: 0, y: 0 },
  { x: ROOM_POLYGON_EDGE_MM, y: 0 },
  { x: ROOM_POLYGON_EDGE_MM, y: ROOM_POLYGON_EDGE_MM },
  { x: 0, y: ROOM_POLYGON_EDGE_MM },
]

// The samples for the optional room tags clear the tag, the path that removes a key.
const ROOM_SAMPLES: CommandSamples = {
  [rooms.SET_ROOM_NAME]: () => rooms.setRoomName(ids.roomKey, 'Sitting room').params,
  [rooms.SET_ROOM_CUSTOM_POLYGON]: () =>
    rooms.setRoomCustomPolygon(ids.roomKey, ROOM_POLYGON).params,
  [rooms.SET_ROOM_PURPOSE]: () => rooms.setRoomPurpose(ids.roomKey, undefined).params,
  [rooms.SET_ROOM_SUB_PURPOSE]: () => rooms.setRoomSubPurpose(ids.roomKey, undefined).params,
  [rooms.SET_ROOM_PERIOD]: () => rooms.setRoomPeriod(ids.roomKey, undefined).params,
  [rooms.SET_ROOM_STYLE]: () => rooms.setRoomStyle(ids.roomKey, undefined).params,
  [rooms.SET_ROOM_CEILING_HEIGHT]: () => rooms.setRoomCeilingHeight(ids.roomKey, undefined).params,
}

const ADDED_STAIR = createStair({
  connection: { fromFloorId: ids.groundFloor, toFloorId: ids.upperFloor },
  id: 'stair-added',
})

const STAIR_SAMPLES: CommandSamples = {
  [stairs.ADD_STAIR]: () => stairs.addStair(structuredClone(ADDED_STAIR)).params,
  [stairs.REMOVE_STAIR]: () => stairs.removeStair(ids.spareStair).params,
  [stairs.MOVE_STAIR]: () =>
    stairs.moveStair(ids.mainStair, { x: STAIR_POSITION_MM, y: STAIR_POSITION_MM }).params,
  [stairs.ROTATE_STAIR]: () => stairs.rotateStair(ids.mainStair, STAIR_ROTATION_RADIANS).params,
  [stairs.SET_STAIR_RUN_TYPE]: () => stairs.setStairRunType(ids.mainStair, 'l-turn').params,
}

const ADDED_OBSTRUCTION = {
  id: 'obstruction-added',
  footprint: [
    { x: 0, y: 0 },
    { x: OBSTRUCTION_EDGE_MM, y: 0 },
    { x: 0, y: OBSTRUCTION_EDGE_MM },
  ],
  height: OBSTRUCTION_HEIGHT_MM,
}

const PAINT_AND_SITE_SAMPLES: CommandSamples = {
  [paint.ASSIGN_SURFACE_TREATMENT]: () =>
    paint.assignSurfaceTreatment(
      { kind: 'floor', floorId: ids.groundFloor },
      solidTreatment(colorFromHex(FIXTURE_COLOR_HEX), FIXTURE_FINISH_ID),
    ).params,
  [paint.CLEAR_SURFACE_PAINT]: () => paint.clearSurfacePaint(PAINTED_SURFACE).params,
  [sites.SET_SITE_LOCATION]: () =>
    sites.setSiteLocation({ latitude: SITE_LATITUDE, longitude: SITE_LONGITUDE }).params,
  [sites.SET_SITE_NORTH_BEARING]: () => sites.setSiteNorthBearing(NORTH_BEARING_RADIANS).params,
  [sites.SET_SITE_TIMEZONE]: () => sites.setSiteTimezone('America/Chicago').params,
  [sites.ADD_OBSTRUCTION]: () => sites.addObstruction(structuredClone(ADDED_OBSTRUCTION)).params,
  [sites.REMOVE_OBSTRUCTION]: () => sites.removeObstruction(ids.obstruction).params,
}

const ADDED_SCENE = { id: 'scene-added', name: 'Dusk', observedAt: '2026-12-21T16:30' }

const ENVIRONMENT_SCENE_SAMPLES: CommandSamples = {
  [scenes.ADD_ENVIRONMENT_SCENE]: () => scenes.addEnvironmentScene({ ...ADDED_SCENE }).params,
  [scenes.REMOVE_ENVIRONMENT_SCENE]: () => scenes.removeEnvironmentScene(ids.spareScene).params,
  [scenes.RENAME_ENVIRONMENT_SCENE]: () =>
    scenes.renameEnvironmentScene(ids.mainScene, 'Winter noon').params,
}

const OPENING_LIGHT_CLOUD_COVER = 0.4

const OPENING_LIGHT_SAMPLES: CommandSamples = {
  [lights.SET_OPENING_LIGHT]: () =>
    lights.setOpeningLight({
      observedAt: '2026-06-21T08:00',
      weather: { cloudCover: OPENING_LIGHT_CLOUD_COVER },
    }).params,
  [lights.CLEAR_OPENING_LIGHT]: () => lights.clearOpeningLight().params,
}

/** Sample parameters for every project-wide command type, keyed by command type. */
export const PROJECT_COMMAND_SAMPLES: CommandSamples = {
  ...PROJECT_SAMPLES,
  ...ENTRANCE_SAMPLES,
  ...PALETTE_SAMPLES,
  ...ROOM_SAMPLES,
  ...STAIR_SAMPLES,
  ...PAINT_AND_SITE_SAMPLES,
  ...ENVIRONMENT_SCENE_SAMPLES,
  ...OPENING_LIGHT_SAMPLES,
}
