import { expect, it } from 'vitest'
import { pathEnd, pathStart } from '../geometry/wall-path'
import { createWall } from '../model/factories'
import { pt } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { floorOf, squareLoopWalls } from './plan-geometry-test-support'
import { buildWallGraph } from './wall-graph'

it('distinguishes a near-collinear overdraw, a disjoint pair, and a genuine crossing', () => {
  const disjoint = [
    createWall(pt(-3060.644843964362, -6.542808178104063), pt(0, 0), { id: 'west' }),
    createWall(
      pt(1.9999954301598095, 0.004275434466833312),
      pt(3674.4955933223077, 7.8550505021214),
      { id: 'east' },
    ),
  ]
  const separated = buildWallGraph(disjoint)
  expect.soft(separated.vertices, 'a gap between near-collinear walls').toHaveLength(4)
  expect.soft(separated.edges.map((edge) => edge.wallId).sort()).toEqual(['east', 'west'])

  const square = squareLoopWalls(0, 4000, 'square')
  const nearCollinear = { id: 'overdraw', thickness: 250 }
  const parallel = createWall(pt(1000, 0.8), pt(3000, 0.8), nearCollinear)
  const tilted = createWall(pt(1000, -0.8), pt(3000, 0.8), nearCollinear)
  const cases = [
    { label: 'parallel overdraw', wall: parallel },
    { label: 'tilted overdraw', wall: tilted },
  ]

  for (const { label, wall } of cases) {
    const { network, rooms } = deriveFloorPlanGeometry(floorOf([...square, wall]))
    const south = network.edges
      .filter((edge) => edge.wallId === 'square-0')
      .map((edge) => [pathStart(edge.path), pathEnd(edge.path)])

    expect.soft(south, label).toEqual([
      [pt(0, 0), pt(1000, 0)],
      [pt(1000, 0), pt(3000, 0)],
      [pt(3000, 0), pt(4000, 0)],
    ])
    expect
      .soft(
        network.edges.some((edge) => edge.wallId === 'overdraw'),
        label,
      )
      .toBe(false)
    expect
      .soft(
        rooms.map((room) => room.area),
        label,
      )
      .toEqual([15_100_996])
  }

  const tighterGraph = buildWallGraph([...square, tilted], { tolerance: 0.1 })
  const crossing = tighterGraph.vertices.findIndex(({ x, y }) => x === 2000 && y === 0)
  expect
    .soft(crossing, 'the tilt crosses the owner at the midpoint with a smaller tolerance')
    .toBeGreaterThanOrEqual(0)
  const crossingWalls = tighterGraph.edges
    .filter((edge) => edge.a === crossing || edge.b === crossing)
    .map((edge) => edge.wallId)
  expect.soft(crossingWalls.sort()).toEqual(['overdraw', 'overdraw', 'square-0', 'square-0'])
})
