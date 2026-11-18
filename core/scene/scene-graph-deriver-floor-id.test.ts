import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Floor, Project } from '../model/types'
import { deriveSceneGraph } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

const FLOOR_A_ID = 'a'
const FLOOR_B_ID = 'b'
const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000

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
