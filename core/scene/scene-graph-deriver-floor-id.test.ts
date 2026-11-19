import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createWall,
} from '../model/factories'
import type { Floor, Project } from '../model/types'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

const FLOOR_A_ID = 'a'
const FLOOR_B_ID = 'b'
const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000
const DOOR_POSITION_MM = 1000
const DOOR_WIDTH_MM = 800
const SOFA_POSITION = { x: 1500, y: 900 }
const SOFA_FOOTPRINT = { width: 2000, depth: 900 }

function projectWith(floor: Floor): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  return { ...project, floors: [floor] }
}

/** A floor whose four walls form one closed loop, so exactly one room is derived. */
function floorWithClosedLoop(id: string): Floor {
  const south = { x: 0, y: 0 }
  const southEast = { x: ROOM_WIDTH_MM, y: 0 }
  const northEast = { x: ROOM_WIDTH_MM, y: ROOM_DEPTH_MM }
  const northWest = { x: 0, y: ROOM_DEPTH_MM }
  return createFloor('Ground', {
    id,
    walls: [
      createWall(south, southEast, { id: 'w-south' }),
      createWall(southEast, northEast, { id: 'w-east' }),
      createWall(northEast, northWest, { id: 'w-north' }),
      createWall(northWest, south, { id: 'w-west' }),
    ],
  })
}

/** A floor with a single wall and a door on it: no closed loop, so no room is derived. */
function floorWithOneWallAndDoor(id: string): Floor {
  const floor = createFloor('Ground', {
    id,
    walls: [createWall({ x: 0, y: 0 }, { x: ROOM_WIDTH_MM, y: 0 }, { id: 'w-south' })],
  })
  const door = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w-south',
    position: DOOR_POSITION_MM,
    width: DOOR_WIDTH_MM,
    id: 'o1',
  })
  return { ...floor, openings: [door] }
}

/** A floor with no walls and one sofa. */
function floorWithSofa(id: string): Floor {
  const sofa = createFurnitureInstance({
    id: 'sofa-1',
    assetRef: { scope: 'project', contentHash: 'sofac0de' },
    position: SOFA_POSITION,
    footprint: SOFA_FOOTPRINT,
  })
  return { ...createFloor('Ground', { id }), furniture: [sofa] }
}

describe('room nodes from a warm createSceneGraphDeriver when their walls move under a floor with another id', () => {
  const floorA = floorWithClosedLoop(FLOOR_A_ID)
  const floorB: Floor = { ...floorA, id: FLOOR_B_ID }

  it('carry the id of the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))

    const { rooms } = derive(projectWith(floorB))

    expect(rooms.map((room) => room.floorId)).toEqual([FLOOR_B_ID])
    expect(rooms).toStrictEqual(deriveSceneGraph(projectWith(floorB)).rooms)
  })

  it('are the same objects again on the next derivation under the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))
    const first = derive(projectWith(floorB)).rooms

    const second = derive(projectWith(floorB)).rooms

    expect(first).not.toHaveLength(0)
    expect(second).toHaveLength(first.length)
    second.forEach((room, index) => expect(room).toBe(first[index]))
  })
})

describe('an opening node from a warm createSceneGraphDeriver when the opening moves under a floor with another id', () => {
  const floorA = floorWithOneWallAndDoor(FLOOR_A_ID)
  const floorB: Floor = { ...floorA, id: FLOOR_B_ID }

  it('carries the id of the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))

    const { openings } = derive(projectWith(floorB))

    expect(openings.map((opening) => opening.floorId)).toEqual([FLOOR_B_ID])
    expect(openings).toStrictEqual(deriveSceneGraph(projectWith(floorB)).openings)
  })

  it('is the same object again on the next derivation under the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))
    const first = derive(projectWith(floorB)).openings

    const second = derive(projectWith(floorB)).openings

    expect(first).not.toHaveLength(0)
    expect(second).toHaveLength(first.length)
    second.forEach((opening, index) => expect(opening).toBe(first[index]))
  })
})

describe('a furniture node from a warm createSceneGraphDeriver when the piece moves under a floor with another id', () => {
  const floorA = floorWithSofa(FLOOR_A_ID)
  const floorB: Floor = { ...floorA, id: FLOOR_B_ID }

  it('carries the id of the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))

    const { furniture } = derive(projectWith(floorB))

    expect(furniture.map((piece) => piece.floorId)).toEqual([FLOOR_B_ID])
    expect(furniture).toStrictEqual(deriveSceneGraph(projectWith(floorB)).furniture)
  })

  it('is the same object again on the next derivation under the new floor', () => {
    const derive = createSceneGraphDeriver()
    derive(projectWith(floorA))
    const first = derive(projectWith(floorB)).furniture

    const second = derive(projectWith(floorB)).furniture

    expect(first).not.toHaveLength(0)
    expect(second).toHaveLength(first.length)
    second.forEach((piece, index) => expect(piece).toBe(first[index]))
  })

  it('is the same object when a new floor object keeps the id', () => {
    const derive = createSceneGraphDeriver()
    const first = derive(projectWith(floorA)).furniture

    const second = derive(projectWith({ ...floorA, name: 'Parlor floor' })).furniture

    expect(first).not.toHaveLength(0)
    expect(second).toHaveLength(first.length)
    second.forEach((piece, index) => expect(piece).toBe(first[index]))
  })
})
