/* eslint-disable max-lines --
 * One describe block per memoized entity kind (floors, stairs, walls, rooms,
 * openings, furniture). The suite grows by one reuse/rebuild block per node kind
 * the deriver memoizes, so the size cap is the wrong tool for this aggregate file.
 */
import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createStair,
  createWall,
} from '../model/factories'
import type { Floor, Opening, Project, Wall } from '../model/types'
import { ROOM_ID_PREFIX } from '../topology/rooms'
import { OPENING_NODE_PREFIX } from './scene-graph'
import { createSceneGraphDeriver } from './scene-graph-deriver'

function projectWith(floors: Floor[]): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = floors
  return project
}

/** A closed rectangular wall loop that derives a single room. */
function enclosedRoomFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w-south' }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { id: 'w-east' }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { id: 'w-north' }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { id: 'w-west' }),
    ],
  })
}

describe('createSceneGraphDeriver', () => {
  it('reuses node references for unchanged floors', () => {
    const ground = createFloor('Ground', { id: 'g' })
    const upper = createFloor('Upper', { id: 'u' })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground, upper]))
    const second = derive(projectWith([ground, upper]))

    expect(second.nodes[0]).toBe(first.nodes[0])
    expect(second.nodes[1]).toBe(first.nodes[1])
  })

  it('rebuilds only the node for a replaced floor', () => {
    const ground = createFloor('Ground', { id: 'g' })
    const upper = createFloor('Upper', { id: 'u' })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground, upper]))
    const editedUpper = { ...upper, name: 'Attic' }
    const second = derive(projectWith([ground, editedUpper]))

    expect(second.nodes[0]).toBe(first.nodes[0])
    expect(second.nodes[1]).not.toBe(first.nodes[1])
    expect(second.nodes[1]!.name).toBe('Attic')
  })
})

describe('createSceneGraphDeriver stairs', () => {
  it('reuses stair nodes for an unchanged stairs reference and rebuilds on change', () => {
    const stair = createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })
    const project = projectWith([
      createFloor('Ground', { id: 'f1' }),
      createFloor('Upper', { id: 'f2' }),
    ])
    const withStairs = { ...project, stairs: [stair] }
    const derive = createSceneGraphDeriver()

    const first = derive(withStairs)
    const second = derive(withStairs)

    expect(second.stairs).toBe(first.stairs)

    const replaced = { ...withStairs, stairs: [stair] }
    expect(derive(replaced).stairs).not.toBe(first.stairs)
  })
})

describe('createSceneGraphDeriver walls', () => {
  it('reuses wall node references for unchanged walls', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'w1' })
    const ground = createFloor('Ground', { id: 'g', walls: [wall] })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground]))
    const second = derive(projectWith([ground]))

    expect(second.walls[0]).toBe(first.walls[0])
  })

  it('rebuilds the wall node when the wall is replaced', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'w1' })
    const ground = createFloor('Ground', { id: 'g', walls: [wall] })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground]))
    const movedWall = { ...wall, end: { x: 2, y: 0 } }
    const moved = createFloor('Ground', { id: 'g', walls: [movedWall] })
    const second = derive(projectWith([moved]))

    expect(second.walls[0]).not.toBe(first.walls[0])
    expect(second.walls[0]!.end).toEqual({ x: 2, y: 0 })
  })
})

describe('createSceneGraphDeriver rooms', () => {
  it('reuses room node references for an unchanged floor', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const second = derive(projectWith([floor]))

    const firstRoom = first.rooms[0]
    if (firstRoom === undefined) throw new Error('expected a derived room on the first pass')
    const secondRoom = second.rooms[0]
    if (secondRoom === undefined) throw new Error('expected a derived room on the second pass')

    expect(secondRoom).toBe(firstRoom)
  })

  it('rebuilds room nodes when the floor object reference changes', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const replaced = { ...floor, walls: [...floor.walls] }
    const third = derive(projectWith([replaced]))

    const firstRoom = first.rooms[0]
    if (firstRoom === undefined) throw new Error('expected a derived room on the first pass')
    const thirdRoom = third.rooms[0]
    if (thirdRoom === undefined)
      throw new Error('expected a derived room after replacing the floor')

    expect(thirdRoom).not.toBe(firstRoom)
  })
})

describe('createSceneGraphDeriver rooms with overrides', () => {
  function projectWithOverrides(floors: Floor[], roomOverrides: Project['roomOverrides']): Project {
    return { ...projectWith(floors), roomOverrides }
  }

  function onlyRoom(graph: ReturnType<ReturnType<typeof createSceneGraphDeriver>>) {
    const room = graph.rooms[0]
    if (room === undefined) throw new Error('expected a derived room')
    return room
  }

  function keyOf(graph: ReturnType<ReturnType<typeof createSceneGraphDeriver>>): string {
    return onlyRoom(graph).id.slice(ROOM_ID_PREFIX.length)
  }

  it('reuses room nodes when the floor and undefined overrides are unchanged', () => {
    const floor = enclosedRoomFloor()
    const project = projectWith([floor])
    const derive = createSceneGraphDeriver()

    const first = derive(project)
    const second = derive(project)

    expect(onlyRoom(second)).toBe(onlyRoom(first))
  })

  it('rebuilds room nodes carrying the new name when roomOverrides change', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const named = projectWithOverrides([floor], { [keyOf(first)]: { name: 'Parlor' } })
    const second = derive(named)

    expect(onlyRoom(second)).not.toBe(onlyRoom(first))
    expect(onlyRoom(second).name).toBe('Parlor')
  })

  it('keeps wall node references when only roomOverrides change', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const named = projectWithOverrides([floor], { [keyOf(first)]: { name: 'Parlor' } })
    const second = derive(named)

    expect(second.walls[0]).toBe(first.walls[0])
  })
})

describe('createSceneGraphDeriver openings', () => {
  const HOST_WALL_LENGTH = 4000
  const HOST_WALL_THICKNESS = 114
  const THICKER_WALL = 200
  const FIRST_OPENING_POSITION = 1000
  const SECOND_OPENING_POSITION = 3000
  const OPENING_WIDTH = 800
  const WIDER_OPENING = 900

  function southWall(): Wall {
    return createWall(
      { x: 0, y: 0 },
      { x: HOST_WALL_LENGTH, y: 0 },
      { id: 'w-south', thickness: HOST_WALL_THICKNESS },
    )
  }

  function eastWall(): Wall {
    return createWall(
      { x: HOST_WALL_LENGTH, y: 0 },
      { x: HOST_WALL_LENGTH, y: HOST_WALL_LENGTH },
      { id: 'w-east', thickness: HOST_WALL_THICKNESS },
    )
  }

  function doorOn(wallId: string, position: number, id: string): Opening {
    return createOpening({
      type: 'single-swing-door',
      hostWallId: wallId,
      position,
      width: OPENING_WIDTH,
      id,
    })
  }

  function floorWith(walls: Wall[], openings: Opening[]): Floor {
    return { ...createFloor('Ground', { id: 'g', walls }), openings }
  }

  function openingNode(graph: ReturnType<ReturnType<typeof createSceneGraphDeriver>>, id: string) {
    const node = graph.openings.find((candidate) => candidate.id === `${OPENING_NODE_PREFIX}${id}`)
    if (node === undefined) throw new Error(`expected an opening node for ${id}`)
    return node
  }

  it('reuses an opening node when the opening and its host wall are unchanged', () => {
    const wall = southWall()
    const opening = doorOn('w-south', FIRST_OPENING_POSITION, 'o1')
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floorWith([wall], [opening])]))
    // An unrelated edit: a brand-new floor object that keeps the same wall and
    // opening object references the assertion reads.
    const editedFloor: Floor = { ...floorWith([wall], [opening]), elevation: 250 }
    const second = derive(projectWith([editedFloor]))

    expect(openingNode(second, 'o1')).toBe(openingNode(first, 'o1'))
  })

  it('rebuilds an opening node when the opening object is replaced', () => {
    const wall = southWall()
    const opening = doorOn('w-south', FIRST_OPENING_POSITION, 'o1')
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floorWith([wall], [opening])]))
    const widened = { ...opening, width: WIDER_OPENING }
    const second = derive(projectWith([floorWith([wall], [widened])]))

    expect(openingNode(second, 'o1')).not.toBe(openingNode(first, 'o1'))
    expect(openingNode(second, 'o1').width).toBe(WIDER_OPENING)
  })

  it('rebuilds an opening node when its host wall moves but the opening is unchanged', () => {
    const wall = southWall()
    const opening = doorOn('w-south', FIRST_OPENING_POSITION, 'o1')
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floorWith([wall], [opening])]))
    const thickerWall = { ...wall, thickness: THICKER_WALL }
    const second = derive(projectWith([floorWith([thickerWall], [opening])]))

    expect(openingNode(second, 'o1')).not.toBe(openingNode(first, 'o1'))
    expect(openingNode(second, 'o1').hostThickness).toBe(THICKER_WALL)
  })

  it('keeps an untouched opening node while a sibling opening is edited', () => {
    const south = southWall()
    const east = eastWall()
    const kept = doorOn('w-south', FIRST_OPENING_POSITION, 'o1')
    const edited = doorOn('w-east', SECOND_OPENING_POSITION, 'o2')
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floorWith([south, east], [kept, edited])]))
    const widenedSibling = { ...edited, width: WIDER_OPENING }
    const second = derive(projectWith([floorWith([south, east], [kept, widenedSibling])]))

    expect(openingNode(second, 'o1')).toBe(openingNode(first, 'o1'))
    expect(openingNode(second, 'o2')).not.toBe(openingNode(first, 'o2'))
  })
})

describe('createSceneGraphDeriver furniture', () => {
  const SOFA_IMAGE = { scope: 'project', contentHash: 'sofac0de' } as const

  function sofa(): ReturnType<typeof createFurnitureInstance> {
    return createFurnitureInstance({
      id: 'sofa-1',
      assetRef: SOFA_IMAGE,
      position: { x: 1500, y: 900 },
      footprint: { width: 2000, depth: 900 },
      rotation: 30,
      elevationZ: 50,
      height: 800,
    })
  }

  function floorWithFurniture(instance: ReturnType<typeof createFurnitureInstance>): Floor {
    return { ...createFloor('Ground', { walls: [] }), furniture: [instance] }
  }

  it('reuses a furniture node while its source instance is unchanged', () => {
    const floor = floorWithFurniture(sofa())
    const project = projectWith([floor])
    const derive = createSceneGraphDeriver()

    const first = derive(project)
    const second = derive(project)

    expect(second.furniture[0]).toBe(first.furniture[0])
  })

  it('rebuilds the furniture node when the instance is replaced', () => {
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floorWithFurniture(sofa())]))
    const second = derive(projectWith([floorWithFurniture(sofa())]))

    expect(second.furniture[0]).not.toBe(first.furniture[0])
  })

  it('carries the source instance assetRef onto the derived furniture node', () => {
    const derive = createSceneGraphDeriver()

    const derived = derive(projectWith([floorWithFurniture(sofa())]))

    expect(derived.furniture[0]?.assetRef).toEqual(SOFA_IMAGE)
  })
})

describe('createSceneGraphDeriver room reuse keyed on the floor walls', () => {
  const TALLER_CEILING = 3200

  function onlyRoom(graph: ReturnType<ReturnType<typeof createSceneGraphDeriver>>) {
    const room = graph.rooms[0]
    if (room === undefined) throw new Error('expected a derived room')
    return room
  }

  it('reuses room nodes when an edit keeps the floor walls', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    // A new Floor object that keeps the same walls array, as an opening or rename
    // edit does. Rooms derive from the wall topology, so they must survive it.
    const edited: Floor = { ...floor, name: 'Parlor floor' }
    expect(edited.walls).toBe(floor.walls)
    const second = derive(projectWith([edited]))

    expect(onlyRoom(second)).toBe(onlyRoom(first))
  })

  it('rebuilds room nodes when a wall changes', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const movedSouth = { ...floor.walls[0]!, end: { x: 5000, y: 0 } }
    const moved: Floor = { ...floor, walls: [movedSouth, ...floor.walls.slice(1)] }
    const second = derive(projectWith([moved]))

    expect(onlyRoom(second)).not.toBe(onlyRoom(first))
  })

  it('rebuilds room nodes when the floor default ceiling height changes', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    // The ceiling-height command keeps the same walls array, so the rooms must
    // still rebuild to carry the new fallback.
    const raised: Floor = { ...floor, defaultCeilingHeight: TALLER_CEILING }
    expect(raised.walls).toBe(floor.walls)
    const second = derive(projectWith([raised]))

    expect(onlyRoom(second)).not.toBe(onlyRoom(first))
    expect(onlyRoom(second).ceilingHeight).toBe(TALLER_CEILING)
  })

  it('rebuilds room nodes when room overrides change', () => {
    const floor = enclosedRoomFloor()
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([floor]))
    const roomKey = onlyRoom(first).id.slice(ROOM_ID_PREFIX.length)
    const named: Project = {
      ...projectWith([floor]),
      roomOverrides: { [roomKey]: { name: 'Parlor' } },
    }
    const second = derive(named)

    expect(onlyRoom(second)).not.toBe(onlyRoom(first))
  })
})
