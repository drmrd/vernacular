import { expect, it } from 'vitest'
import { pathEnd, pathStart } from '../geometry/wall-path'
import { createWall } from '../model/factories'
import { pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import {
  BRICK_PROFILE,
  brickRegistries,
  faceOf,
  floorOf,
  SIDES,
  squareLoopWalls,
} from './plan-geometry-test-support'

it('gives each shared wall stretch the geometry of the first wall that covers it', () => {
  const [, ...otherSides] = squareLoopWalls(0, 4000, 'square')
  const brick = { ...wall('brick', pt(0, 0), pt(4000, 0)), constructionProfile: BRICK_PROFILE }
  const backward = createWall(pt(4000, 0), pt(0, 0), { id: 'z-backward', thickness: 200 })
  const copy = wall('a-copy', pt(0, 0), pt(4000, 0))
  const dot = wall('dot', pt(2000, 2000), pt(2000, 2000))
  const merged = wall('merged', pt(0, -0.6), pt(0, 0.6))
  const orders = [
    { owner: brick, covered: [backward, copy], startX: 0, endX: 4000, thickness: 400 },
    { owner: backward, covered: [brick, copy], startX: 4000, endX: 0, thickness: 200 },
  ]

  for (const { owner, covered, startX, endX, thickness } of orders) {
    const walls = [owner, ...otherSides, ...covered, dot, merged]
    const { network, rooms, setAside } = deriveFloorPlanGeometry(floorOf(walls), brickRegistries())
    const coveredIds = covered.map((each) => each.id)
    const southernEdges = network.edges.filter(
      (edge) => edge.from !== edge.to && pathStart(edge.path).y === 0 && pathEnd(edge.path).y === 0,
    )
    const boundaryStretches = southernEdges.map((edge) => {
      const footprint = network.footprints[edge.index]
      return {
        owner: edge.wallId,
        from: pathStart(edge.path),
        to: pathEnd(edge.path),
        covers: edge.covers,
        thickness: footprint && Math.abs(footprint.aPlus.y - footprint.aMinus.y),
      }
    })

    expect
      .soft(boundaryStretches, owner.id)
      .toEqual([
        { owner: owner.id, from: pt(startX, 0), to: pt(endX, 0), covers: coveredIds, thickness },
      ])
    expect.soft(setAside.coveredWallIds, owner.id).toEqual(coveredIds)
    expect.soft([...setAside.zeroLengthWallIds].sort(), owner.id).toEqual(['dot', 'merged'])
    expect
      .soft(
        rooms.map((room) => room.wallIds),
        owner.id,
      )
      .toEqual([[owner.id, ...otherSides.map((each) => each.id)].sort()])
    for (const id of coveredIds) {
      expect
        .soft(
          SIDES.map((side) => faceOf(network, id, side).stretches),
          id,
        )
        .toEqual([[], []])
    }
    for (const edge of network.edges.filter((candidate) => candidate.wallId !== owner.id)) {
      expect.soft(edge.covers, edge.wallId).toEqual([])
    }
  }

  const left = wall('left', pt(0, 0), pt(2000, 0))
  const right = wall('right', pt(2000, 0), pt(4000, 0))
  const bridge = wall('bridge', pt(4000, 0), pt(0, 0))
  const withTails = wall('with-tails', pt(6000, 0), pt(-1000, 0))
  const { network, setAside } = deriveFloorPlanGeometry(floorOf([left, right, bridge, withTails]))

  expect.soft(setAside.coveredWallIds, 'a wall covered by two earlier walls').toEqual(['bridge'])
  expect
    .soft(
      network.edges.map((edge) => ({
        wallId: edge.wallId,
        startX: pathStart(edge.path).x,
        endX: pathEnd(edge.path).x,
        covers: edge.covers,
      })),
    )
    .toEqual([
      { wallId: 'left', startX: 0, endX: 2000, covers: ['bridge', 'with-tails'] },
      { wallId: 'right', startX: 2000, endX: 4000, covers: ['bridge', 'with-tails'] },
      { wallId: 'with-tails', startX: 6000, endX: 4000, covers: [] },
      { wallId: 'with-tails', startX: 0, endX: -1000, covers: [] },
    ])
  for (const side of SIDES) {
    expect.soft(faceOf(network, withTails.id, side).stretches, side).toEqual([
      { fromMm: 0, toMm: 2000, roomIndex: undefined },
      { fromMm: 6000, toMm: 7000, roomIndex: undefined },
    ])
  }
})
