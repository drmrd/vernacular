import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Floor, Project } from '../model/types'
import { createSceneGraphDeriver } from './scene-graph-deriver'

function projectWith(floors: Floor[]): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = floors
  return project
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
  function rectangleFloor(): Floor {
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

  it('reuses room node references for an unchanged floor', () => {
    const floor = rectangleFloor()
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
    const floor = rectangleFloor()
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
