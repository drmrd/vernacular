import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createOpening, createWall } from '../model/factories'
import type { Floor } from '../model/types'
import { effectiveWallThickness } from './construction-profile'
import {
  OPENING_NODE_PREFIX,
  deriveOpeningNode,
  deriveOpeningNodesForFloor,
  deriveSceneGraph,
} from './scene-graph'

const OPENING_HOST_WALL_LENGTH = 2000
const OPENING_HOST_WALL_THICKNESS = 114
const OPENING_POSITION = 1000
const OPENING_WIDTH = 800
const MASONRY_BRICK_PROFILE = 'solid-masonry-brick'

function floorWithHostedOpening(): Floor {
  const wall = createWall(
    { x: 0, y: 0 },
    { x: OPENING_HOST_WALL_LENGTH, y: 0 },
    { id: 'w1', thickness: OPENING_HOST_WALL_THICKNESS },
  )
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: OPENING_POSITION,
    width: OPENING_WIDTH,
    id: 'o1',
  })
  return { ...createFloor('Ground', { id: 'g', walls: [wall] }), openings: [opening] }
}

describe('deriveOpeningNode', () => {
  it('cuts through the full construction-profile assembly thickness, not the raw wall thickness', () => {
    const wall = {
      ...createWall(
        { x: 0, y: 0 },
        { x: OPENING_HOST_WALL_LENGTH, y: 0 },
        { id: 'w1', thickness: OPENING_HOST_WALL_THICKNESS },
      ),
      constructionProfile: MASONRY_BRICK_PROFILE,
    }
    const floor = createFloor('Ground', { id: 'g', walls: [wall] })
    const opening = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: OPENING_POSITION,
      width: OPENING_WIDTH,
      id: 'o1',
    })

    const node = deriveOpeningNode(floor, opening, wall)

    expect(node.hostThickness).toBe(effectiveWallThickness(wall))
  })
})

describe('deriveOpeningNodesForFloor', () => {
  it('projects each opening into a node with the host-wall geometry and passthrough fields', () => {
    const floor = floorWithHostedOpening()
    const opening = floor.openings[0]
    if (opening === undefined) {
      throw new Error('expected one opening on the fixture floor')
    }

    const nodes = deriveOpeningNodesForFloor(floor)

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      id: `${OPENING_NODE_PREFIX}o1`,
      kind: 'opening',
      floorId: 'g',
      type: 'single-swing-door',
      center: { x: OPENING_POSITION, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: OPENING_WIDTH,
      height: opening.height,
      sillHeight: opening.sillHeight,
      hostThickness: OPENING_HOST_WALL_THICKNESS,
      orientation: opening.orientation,
      hostWallId: 'w1',
    })
  })

  it('carries the host wall id so the opening can be resolved to a graph edge', () => {
    const floor = floorWithHostedOpening()

    const nodes = deriveOpeningNodesForFloor(floor)

    expect(nodes[0]?.hostWallId).toBe('w1')
  })

  it('skips an opening whose host wall is absent from the floor', () => {
    const base = floorWithHostedOpening()
    const orphan = createOpening({
      type: 'single-swing-door',
      hostWallId: 'missing',
      position: OPENING_POSITION,
      width: OPENING_WIDTH,
      id: 'o2',
    })
    const floor: Floor = { ...base, openings: [...base.openings, orphan] }

    const nodes = deriveOpeningNodesForFloor(floor)

    expect(nodes).toHaveLength(1)
    expect(nodes.map((node) => node.id)).toEqual([`${OPENING_NODE_PREFIX}o1`])
  })
})

describe('deriveSceneGraph openings', () => {
  it('flat-maps each floor opening into graph.openings, tagged with its floor id', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [floorWithHostedOpening()]

    const graph = deriveSceneGraph(project)

    expect(graph.openings).toHaveLength(1)
    expect(graph.openings[0]).toMatchObject({
      id: `${OPENING_NODE_PREFIX}o1`,
      kind: 'opening',
      floorId: 'g',
      type: 'single-swing-door',
      center: { x: OPENING_POSITION, y: 0 },
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: OPENING_WIDTH,
      hostThickness: OPENING_HOST_WALL_THICKNESS,
    })
  })

  it('yields an empty openings array when no floor has an opening', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [createFloor('Ground', { id: 'g', elevation: 0, walls: [wall] })]

    const graph = deriveSceneGraph(project)

    expect(graph.openings).toEqual([])
  })
})
