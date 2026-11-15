import {
  assignSurfacePaint,
  colorFromHex,
  createEmptyProject,
  moveFurniture,
  moveWallEndpoint,
  renameProject,
  resizeOpening,
  setFloorCeilingHeight,
  type Command,
  type Floor,
  type Project,
} from '../../core'
import { buildReferenceDimensions } from './reference-dimensions'
import { buildReferenceFloor, buildReferenceStairs } from './reference-layout'
import { paintReferenceSurfaces } from './reference-paint'

/** The floor count that section 6.10 of the design specification budgets for. */
export const REFERENCE_FLOOR_COUNT = 4
const REFERENCE_APP_VERSION = '0.0.0'
const REFERENCE_NAME = 'Reference project'

const WALL_ENDPOINT_SHIFT_MM = 500
const FURNITURE_SHIFT_MM = 300
const OPENING_WIDENING_MM = 100
const CEILING_RAISE_MM = 300
const EDIT_PAINT_HEX = '#3f5a6e'

/** The same document on every call: no randomness, no clock, fixed ids, appVersion '0.0.0'. */
export function createReferenceProject(): Project {
  const project = createEmptyProject({
    name: REFERENCE_NAME,
    units: 'imperial',
    period: 'victorian',
    appVersion: REFERENCE_APP_VERSION,
  })
  project.floors = Array.from({ length: REFERENCE_FLOOR_COUNT }, (_, index) => {
    const floor = buildReferenceFloor(index)
    return { ...floor, dimensions: buildReferenceDimensions(floor.id) }
  })
  project.stairs = buildReferenceStairs(project.floors)
  paintReferenceSurfaces(project)
  return project
}

function required<T>(item: T | undefined, what: string): T {
  if (item === undefined) {
    throw new Error(`The reference project has no ${what}`)
  }
  return item
}

/** Every edit targets the ground floor, the first floor of the project. */
function groundFloor(project: Project): Floor {
  return required(project.floors[0], 'ground floor')
}

function moveFirstWallEndpoint(project: Project): Command {
  const floor = groundFloor(project)
  const wall = required(floor.walls[0], 'wall')
  const to = { x: wall.end.x, y: wall.end.y - WALL_ENDPOINT_SHIFT_MM }
  return moveWallEndpoint(floor.id, wall.id, 'end', to)
}

function moveFirstFurniture(project: Project): Command {
  const floor = groundFloor(project)
  const piece = required(floor.furniture[0], 'furniture')
  const to = { x: piece.position.x + FURNITURE_SHIFT_MM, y: piece.position.y }
  return moveFurniture(floor.id, piece.id, to)
}

function widenFirstOpening(project: Project): Command {
  const floor = groundFloor(project)
  const opening = required(floor.openings[0], 'opening')
  const { height, sillHeight } = opening
  return resizeOpening(floor.id, opening.id, {
    width: opening.width + OPENING_WIDENING_MM,
    height,
    sillHeight,
  })
}

/** Paints the right face of the first wall, which the reference project leaves bare. */
function paintFirstWallFace(project: Project): Command {
  const wall = required(groundFloor(project).walls[0], 'wall')
  return assignSurfacePaint(
    { kind: 'wall-face', wallId: wall.id, side: 'right' },
    colorFromHex(EDIT_PAINT_HEX),
  )
}

function raiseGroundCeiling(project: Project): Command {
  const floor = groundFloor(project)
  return setFloorCeilingHeight(floor.id, floor.defaultCeilingHeight + CEILING_RAISE_MM)
}

/** The six gated edits, each built from ids of the reference project. */
export const REFERENCE_EDITS: readonly { name: string; command: (project: Project) => Command }[] =
  [
    { name: 'move-wall-endpoint', command: moveFirstWallEndpoint },
    { name: 'move-furniture', command: moveFirstFurniture },
    { name: 'resize-opening', command: widenFirstOpening },
    { name: 'paint-surface', command: paintFirstWallFace },
    { name: 'set-ceiling-height', command: raiseGroundCeiling },
    { name: 'rename-project', command: () => renameProject(`${REFERENCE_NAME}, renamed`) },
  ]
