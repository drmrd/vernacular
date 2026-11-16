// Sample parameters for the commands that act on the objects of one floor:
// walls, underlays, openings, furniture, dimensions, and the multi-entity
// transforms. Built against the ids of the extensions fixture.

import {
  createDimension,
  createFurnitureInstance,
  createOpening,
  createUnderlay,
  createWall,
} from '../../model/factories'
import type { FurnitureFootprint, Point } from '../../model/types'
import * as dimensions from '../handlers/dimension-commands'
import * as furniture from '../handlers/furniture-commands'
import * as openings from '../handlers/opening-commands'
import * as transforms from '../handlers/transform-commands'
import * as underlays from '../handlers/underlay-commands'
import * as walls from '../handlers/wall-commands'
import {
  FIXTURE_DOOR_TYPE,
  FIXTURE_IDS,
  MAIN_WALL_LENGTH_MM,
  SIDE_WALL_LENGTH_MM,
} from './extensions-fixture'
import type { CommandSamples } from './project-command-samples'

const ids = FIXTURE_IDS
const floor = ids.groundFloor
const STEP_MM = 250
const NEW_WALL_THICKNESS_MM = 150
const ADDED_OPENING_POSITION_MM = 3000
const MOVED_OPENING_POSITION_MM = 1200
const RESIZED_OPENING_WIDTH_MM = 900
const RESIZED_OPENING_HEIGHT_MM = 2100
const RESIZED_OPENING_POSITION_MM = 1550
const UNDERLAY_SIDE_PX = 400
const UNDERLAY_SCALE_MM_PER_PX = 5
const UNDERLAY_OPACITY = 0.5
const FURNITURE_SIDE_MM = 700
const FURNITURE_HEIGHT_MM = 900
const FURNITURE_ROTATION_DEGREES = 45
const QUARTER_TURN_RADIANS = Math.PI / 2

/** A fresh point one step from the origin, so no sample shares an object with the document. */
function step(): Point {
  return { x: STEP_MM, y: STEP_MM }
}

const WALL_SAMPLES: CommandSamples = {
  [walls.ADD_WALL]: () =>
    walls.addWall(floor, { x: MAIN_WALL_LENGTH_MM, y: 0 }, { x: MAIN_WALL_LENGTH_MM, y: STEP_MM })
      .params,
  [walls.MOVE_WALL_ENDPOINT]: () =>
    walls.moveWallEndpoint(floor, ids.mainWall, 'end', {
      x: MAIN_WALL_LENGTH_MM + STEP_MM,
      y: 0,
    }).params,
  [walls.SET_WALL_THICKNESS]: () =>
    walls.setWallThickness(floor, ids.mainWall, NEW_WALL_THICKNESS_MM).params,
}

const UNDERLAY_SAMPLES: CommandSamples = {
  [underlays.PLACE_UNDERLAY]: () => {
    const image = { scope: 'project', contentHash: 'hash-underlay-added' } as const
    const size = { width: UNDERLAY_SIDE_PX, height: UNDERLAY_SIDE_PX }
    return underlays.placeUnderlay(floor, createUnderlay({ image, ...size })).params
  },
  [underlays.CALIBRATE_UNDERLAY]: () =>
    underlays.calibrateUnderlay(floor, ids.mainUnderlay, {
      offset: step(),
      millimetersPerPixel: UNDERLAY_SCALE_MM_PER_PX,
      rotation: QUARTER_TURN_RADIANS,
    }).params,
  [underlays.MOVE_UNDERLAY]: () => underlays.moveUnderlay(floor, ids.mainUnderlay, step()).params,
  [underlays.SET_UNDERLAY_OPACITY]: () =>
    underlays.setUnderlayOpacity(floor, ids.mainUnderlay, UNDERLAY_OPACITY).params,
  [underlays.SET_UNDERLAY_VISIBILITY]: () =>
    underlays.setUnderlayVisibility(floor, ids.mainUnderlay, false).params,
  [underlays.REMOVE_UNDERLAY]: () => underlays.removeUnderlay(floor, ids.spareUnderlay).params,
}

const RESIZED_OPENING = {
  width: RESIZED_OPENING_WIDTH_MM,
  height: RESIZED_OPENING_HEIGHT_MM,
  sillHeight: 0,
}

const OPENING_SAMPLES: CommandSamples = {
  [openings.PLACE_OPENING]: () =>
    openings.placeOpening(
      floor,
      createOpening({
        type: FIXTURE_DOOR_TYPE,
        hostWallId: ids.mainWall,
        position: ADDED_OPENING_POSITION_MM,
        id: 'opening-added',
      }),
    ).params,
  [openings.MOVE_OPENING]: () =>
    openings.moveOpening(floor, ids.mainOpening, MOVED_OPENING_POSITION_MM).params,
  [openings.RESIZE_OPENING]: () =>
    openings.resizeOpening(floor, ids.mainOpening, { ...RESIZED_OPENING }).params,
  [openings.RESIZE_OPENING_EDGE]: () =>
    openings.resizeOpeningEdge(
      floor,
      ids.mainOpening,
      RESIZED_OPENING_WIDTH_MM,
      RESIZED_OPENING_POSITION_MM,
    ).params,
  [openings.FLIP_OPENING]: () => openings.flipOpening(floor, ids.mainOpening, 'hinge').params,
  [openings.SET_OPENING_TYPE]: () =>
    openings.setOpeningType(floor, ids.mainOpening, 'double-swing-door').params,
  [openings.REMOVE_OPENING]: () => openings.removeOpening(floor, ids.sideOpening).params,
}

function squareFootprint(): FurnitureFootprint {
  return { width: FURNITURE_SIDE_MM, depth: FURNITURE_SIDE_MM }
}

const FURNITURE_SAMPLES: CommandSamples = {
  [furniture.PLACE_FURNITURE]: () =>
    furniture.placeFurniture(
      floor,
      createFurnitureInstance({
        assetRef: { scope: 'user', contentHash: 'hash-furniture-added' },
        position: step(),
        footprint: squareFootprint(),
        id: 'furniture-added',
      }),
    ).params,
  [furniture.MOVE_FURNITURE]: () => furniture.moveFurniture(floor, ids.furniture, step()).params,
  [furniture.ROTATE_FURNITURE]: () =>
    furniture.rotateFurniture(floor, ids.furniture, FURNITURE_ROTATION_DEGREES).params,
  [furniture.RESIZE_FURNITURE]: () =>
    furniture.resizeFurniture(floor, ids.furniture, squareFootprint()).params,
  [furniture.SET_FURNITURE_HEIGHT]: () =>
    furniture.setFurnitureHeight(floor, ids.furniture, FURNITURE_HEIGHT_MM).params,
  [furniture.SET_FURNITURE_NAME]: () =>
    furniture.setFurnitureName(floor, ids.furniture, 'Settee').params,
  [furniture.REMOVE_FURNITURE]: () => furniture.removeFurniture(floor, ids.furniture).params,
}

const DIMENSION_SAMPLES: CommandSamples = {
  [dimensions.ADD_DIMENSION]: () =>
    dimensions.addDimension(
      floor,
      createDimension({ start: { x: 0, y: 0 }, end: { x: 0, y: SIDE_WALL_LENGTH_MM } }),
    ).params,
  [dimensions.REMOVE_DIMENSION]: () => dimensions.removeDimension(floor, ids.spareDimension).params,
}

const SELECTION = [ids.mainWall, ids.mainDimension]

const TRANSFORM_SAMPLES: CommandSamples = {
  [transforms.TRANSLATE_ENTITIES]: () =>
    transforms.translateEntities(floor, [...SELECTION], step()).params,
  [transforms.ROTATE_ENTITIES]: () =>
    transforms.rotateEntities(floor, [...SELECTION], { x: 0, y: 0 }, QUARTER_TURN_RADIANS).params,
  [transforms.DELETE_ENTITIES]: () => transforms.deleteEntities(floor, [ids.sideWall]).params,
  [transforms.PASTE_ENTITIES]: () => {
    const wall = createWall(step(), { x: SIDE_WALL_LENGTH_MM, y: STEP_MM }, { id: 'wall-pasted' })
    const pasted = { walls: [wall], openings: [], dimensions: [], ids: [wall.id] }
    return transforms.pasteEntities(floor, pasted).params
  },
}

/** Sample parameters for every command type that acts on one floor, keyed by command type. */
export const FLOOR_COMMAND_SAMPLES: CommandSamples = {
  ...WALL_SAMPLES,
  ...UNDERLAY_SAMPLES,
  ...OPENING_SAMPLES,
  ...FURNITURE_SAMPLES,
  ...DIMENSION_SAMPLES,
  ...TRANSFORM_SAMPLES,
}
