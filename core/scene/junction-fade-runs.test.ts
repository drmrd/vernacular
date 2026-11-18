import { describe, expect, it } from 'vitest'
import type { Floor, Point } from '../model/types'
import { distance } from '../geometry/point'
import {
  buildWallGraph,
  DEFAULT_JUNCTION_TOLERANCE_MM,
  type PlanarGraph,
} from '../topology/wall-graph'
import { exteriorWalls } from './exterior-walls'
import { junctionFadeGroups, type JunctionFadeGroup } from './junction-fade'
import type { OpeningSceneNode, RoomSceneNode, WallSceneNode } from './scene-graph'
import { flushEllFloor, longNorthWallFloor, nodesOf } from './wall-runs-test-fixtures'

const FLOOR_ID = 'g'
const WALL_THICKNESS = 100
const EXACT_MM = 1e-6

interface Plan {
  graph: PlanarGraph
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
}

const point = (x: number, y: number): Point => ({ x, y })

const wallNode = (id: string, start: Point, end: Point): WallSceneNode => ({
  id,
  kind: 'wall',
  floorId: FLOOR_ID,
  start,
  end,
  thickness: WALL_THICKNESS,
})

const roomNode = (id: string, ring: Point[]): RoomSceneNode => ({
  id,
  kind: 'room',
  floorId: FLOOR_ID,
  polygon: ring,
  clearPolygon: ring,
  area: 1,
})

function planOf(floor: Floor): Plan {
  return { graph: buildWallGraph(floor.walls), ...nodesOf(floor) }
}

/** The one junction group whose incident edges all share the graph vertex at `at`, within 1 mm. */
function groupAt(plan: Plan, at: Point): JunctionFadeGroup {
  const groups = junctionFadeGroups(plan.graph, plan.walls, plan.rooms, plan.openings)
  const sharing = groups.filter((group) =>
    group.edgeIndexes.every((index) => {
      const edge = plan.graph.edges[index]
      return [edge?.a, edge?.b].some((vertex) => {
        const corner = vertex === undefined ? undefined : plan.graph.vertices[vertex]
        return corner !== undefined && distance(corner, at) <= DEFAULT_JUNCTION_TOLERANCE_MM
      })
    }),
  )

  expect(sharing).toHaveLength(1)
  return sharing[0] as JunctionFadeGroup
}

/** Where, in the array exteriorWalls returns for the plan, the run of the wall from fromMm sits. */
function positionOfRun(plan: Plan, wallId: string, fromMm: number): number {
  const runs = exteriorWalls(plan.walls, plan.rooms, plan.openings)
  const position = runs.findIndex(
    (run) => run.wallId === wallId && Math.abs(run.fromMm - fromMm) < EXACT_MM,
  )

  expect(position).toBeGreaterThanOrEqual(0)
  return position
}

const ascending = (positions: number[]): number[] => [...positions].sort((a, b) => a - b)

describe('junctionFadeGroups on a wall with an ell flush against its end', () => {
  const plan = planOf(flushEllFloor())

  it('tracks the run past the ell and the run of the ell wall at the inner junction, and holds opaque', () => {
    const group = groupAt(plan, point(4000, 0))

    expect(group.fillHoldsUnconditionally).toBe(true)
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:ell-east', 'wall:long-south'])
    expect(group.exteriorRunIndexes).toEqual(
      ascending([
        positionOfRun(plan, 'wall:long-south', 4000),
        positionOfRun(plan, 'wall:ell-east', 0),
      ]),
    )
    expect(group.exteriorRunIndexes).toEqual([0, 6])
  })

  it('tracks the run of the end wall and the run of the ell wall at the corner, and holds opaque', () => {
    const group = groupAt(plan, point(0, 0))

    expect(group.fillHoldsUnconditionally).toBe(true)
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:ell-west', 'wall:west'])
    expect(group.exteriorRunIndexes).toEqual(
      ascending([positionOfRun(plan, 'wall:west', 0), positionOfRun(plan, 'wall:ell-west', 0)]),
    )
    expect(group.exteriorRunIndexes).toEqual([3, 4])
  })
})

const REVERSED_WALL_ID = 'long-south'

/** The flush ell floor with the long south wall drawn from its east end to its west end. */
function flushEllFloorWithReversedLongWall(): Floor {
  const floor = flushEllFloor()
  const reversed = floor.walls.find(
    (wall) => wall.id === REVERSED_WALL_ID,
  ) as Floor['walls'][number]
  const wallLength = distance(reversed.start, reversed.end)
  return {
    ...floor,
    walls: floor.walls.map((wall) =>
      wall.id === REVERSED_WALL_ID ? { ...wall, start: wall.end, end: wall.start } : wall,
    ),
    openings: floor.openings.map((opening) =>
      opening.hostWallId === REVERSED_WALL_ID
        ? { ...opening, position: wallLength - opening.position }
        : opening,
    ),
  }
}

describe('junctionFadeGroups on a wall drawn against the direction of its graph edge', () => {
  const plan = planOf(flushEllFloorWithReversedLongWall())

  it('tracks the run measured from the wall start, and holds opaque, at the inner junction', () => {
    const runs = exteriorWalls(plan.walls, plan.rooms, plan.openings)
    const longRun = runs.find((run) => run.wallId === 'wall:long-south')
    const group = groupAt(plan, point(4000, 0))

    expect(longRun).toMatchObject({ fromMm: 0, toMm: 6000 })
    expect(longRun?.outwardNormal.x).toBeCloseTo(0, 9)
    expect(longRun?.outwardNormal.y).toBeCloseTo(-1, 9)
    expect(group.fillHoldsUnconditionally).toBe(true)
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:ell-east', 'wall:long-south'])
    expect(group.exteriorRunIndexes).toEqual(
      ascending([
        positionOfRun(plan, 'wall:long-south', 0),
        positionOfRun(plan, 'wall:ell-east', 0),
      ]),
    )
  })
})

describe('junctionFadeGroups on a room whose north wall runs on past it', () => {
  it('tracks the run beside the room and the east wall at the junction, and holds opaque', () => {
    const plan = planOf(longNorthWallFloor())
    const group = groupAt(plan, point(4000, 3000))

    expect(group.fillHoldsUnconditionally).toBe(true)
    expect([...group.exteriorWallIds].sort()).toEqual(['wall:east', 'wall:long-north'])
    expect(group.exteriorRunIndexes).toEqual(
      ascending([positionOfRun(plan, 'wall:east', 0), positionOfRun(plan, 'wall:long-north', 0)]),
    )
    expect(group.exteriorRunIndexes).toEqual([1, 2])
  })
})

describe('junctionFadeGroups on a tee and on a corner of three exterior walls', () => {
  function groupOf(plan: Plan): JunctionFadeGroup {
    const groups = junctionFadeGroups(plan.graph, plan.walls, plan.rooms)

    expect(groups).toHaveLength(1)
    return groups[0] as JunctionFadeGroup
  }

  it('tracks only the run of the through wall at a tee with an interior leg', () => {
    const plan: Plan = {
      graph: buildWallGraph([
        { id: 'bar', start: point(0, 0), end: point(2000, 0), thickness: WALL_THICKNESS },
        { id: 'leg', start: point(1000, 0), end: point(1000, 1000), thickness: WALL_THICKNESS },
      ]),
      walls: [
        wallNode('wall:bar', point(0, 0), point(2000, 0)),
        wallNode('wall:leg', point(1000, 0), point(1000, 1000)),
      ],
      rooms: [
        roomNode('room:a', [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)]),
        roomNode('room:b', [point(1000, 0), point(2000, 0), point(2000, 1000), point(1000, 1000)]),
      ],
      openings: [],
    }
    const group = groupOf(plan)

    expect(group.exteriorRunIndexes).toEqual([positionOfRun(plan, 'wall:bar', 0)])
    expect(group.exteriorRunIndexes).toEqual([0])
  })

  it('tracks all three runs at a corner where every wall is exterior, and lets the fill follow the camera', () => {
    const plan: Plan = {
      graph: buildWallGraph([
        { id: 'west', start: point(0, 0), end: point(1000, 0), thickness: WALL_THICKNESS },
        { id: 'east', start: point(1000, 0), end: point(2000, 0), thickness: WALL_THICKNESS },
        { id: 'north', start: point(1000, 0), end: point(1000, 1000), thickness: WALL_THICKNESS },
      ]),
      walls: [
        wallNode('wall:west', point(0, 0), point(1000, 0)),
        wallNode('wall:east', point(1000, 0), point(2000, 0)),
        wallNode('wall:north', point(1000, 0), point(1000, 1000)),
      ],
      rooms: [
        roomNode('room:a', [point(0, 0), point(1000, 0), point(1000, 1000), point(0, 1000)]),
        roomNode('room:b', [
          point(1000, 0),
          point(2000, 0),
          point(2000, -1000),
          point(1000, -1000),
        ]),
      ],
      openings: [],
    }
    const group = groupOf(plan)

    expect(group.fillHoldsUnconditionally).toBe(false)
    expect(group.exteriorRunIndexes).toEqual(
      ascending(['wall:west', 'wall:east', 'wall:north'].map((id) => positionOfRun(plan, id, 0))),
    )
    expect(group.exteriorRunIndexes).toEqual([0, 1, 2])
  })
})
