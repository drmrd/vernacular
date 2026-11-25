import { expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  decodeDocument,
  deriveSceneGraph,
  encodeDocument,
  type Opening,
} from '../../core'
import { buildScene } from '../../engine'
import {
  HEIGHT as WALL_HEIGHT,
  roleArea,
  roleTriangleCount,
  THICKNESS as WALL_THICKNESS,
  WALL_LENGTH,
} from '../../engine/scene/wall-test-support'
import { findByEntityId, Mesh, Raycaster } from '../../engine/testing'

const OWNER = 'owner'
const COPY = 'copy'
const OWNER_DOOR = 'owner-door'
const COPY_DOOR = 'copy-door'
const DOOR_HEIGHT = 2000
const DOOR_WIDTH = 1000
const OPEN_HEIGHT = 800

function reopenedWithOpenings(openings: Opening[]) {
  const floor = createFloor('Ground', {
    id: 'ground',
    defaultCeilingHeight: WALL_HEIGHT,
    walls: [
      createWall(
        { x: 0, y: 0 },
        { x: WALL_LENGTH, y: 0 },
        { id: OWNER, thickness: WALL_THICKNESS },
      ),
      createWall({ x: WALL_LENGTH, y: 0 }, { x: 0, y: 0 }, { id: COPY, thickness: 300 }),
    ],
  })
  floor.openings = openings
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [floor]

  const decoded = decodeDocument(encodeDocument(project, undefined).bytes)
  if (!decoded.ok) throw new Error(`Could not reopen the fixture: ${decoded.failure.kind}`)
  return decoded.value.project
}

function reopenedWithDoors(copyCenter: number) {
  const source = [
    {
      id: OWNER_DOOR,
      hostWallId: OWNER,
      position: 2000,
      orientation: { hinge: 'start', facing: 'positive' },
    },
    {
      id: COPY_DOOR,
      hostWallId: COPY,
      position: WALL_LENGTH - copyCenter,
      orientation: { hinge: 'end', facing: 'negative' },
    },
  ] as const
  const openings = source.map((opening) =>
    createOpening({
      ...opening,
      type: 'single-swing-door',
      width: DOOR_WIDTH,
      height: DOOR_HEIGHT,
      sillHeight: 0,
    }),
  )
  return { project: reopenedWithOpenings(openings), source }
}

function acrossWall(owner: Mesh, x: number, height: number) {
  const from = owner.position.clone().set(x, height, 1000)
  const direction = owner.position.clone().set(0, 0, -1)
  return new Raycaster(from, direction).intersectObject(owner, false)
}

interface ApertureProbe {
  name: string
  westJamb: number
  eastJamb: number
  voidProbeX: number
}

function expectApertureRays(
  owner: Mesh,
  { name, westJamb, eastJamb, voidProbeX }: ApertureProbe,
): void {
  for (const x of [westJamb + 1, voidProbeX, eastJamb - 1]) {
    expect
      .soft(acrossWall(owner, x, OPEN_HEIGHT), `${name}, through the opening at x=${x}`)
      .toHaveLength(0)
  }
  for (const x of [westJamb - 1, eastJamb + 1]) {
    expect
      .soft(acrossWall(owner, x, OPEN_HEIGHT)[0]?.point.z, `${name}, outside at x=${x}`)
      .toBeCloseTo(WALL_THICKNESS / 2)
  }
  expect
    .soft(acrossWall(owner, voidProbeX, DOOR_HEIGHT + 1)[0]?.point.z, `${name}, above the doors`)
    .toBeCloseTo(WALL_THICKNESS / 2)

  const inside = owner.position.clone().set(voidProbeX, OPEN_HEIGHT, 17)
  for (const [direction, jambX] of [
    [-1, westJamb],
    [1, eastJamb],
  ] as const) {
    const limit = Math.abs(jambX - voidProbeX) + 1
    const towardJamb = owner.position.clone().set(direction, 0, 0)
    const hits = new Raycaster(inside, towardJamb, 0, limit).intersectObject(owner, false)
    expect
      .soft(
        hits.map((hit) => hit.point.x),
        `${name}, toward the jamb at x=${jambX}`,
      )
      .toEqual([jambX])
  }
  const up = owner.position.clone().set(0, 1, 0)
  const lintel = new Raycaster(inside, up, 0, DOOR_HEIGHT - OPEN_HEIGHT + 1).intersectObject(
    owner,
    false,
  )
  expect
    .soft(
      lintel.map((hit) => hit.point.y),
      `${name}, up to the lintel`,
    )
    .toEqual([DOOR_HEIGHT])
}

it('cuts one aperture in the owner for saved doors that share space', () => {
  const cases = [
    { name: 'coincident doors', copyCenter: 2000, eastJamb: 2500, voidProbeX: 2000 },
    { name: 'partially overlapping doors', copyCenter: 2600, eastJamb: 3100, voidProbeX: 2300 },
  ]
  for (const { name, copyCenter, eastJamb, voidProbeX } of cases) {
    const { project, source } = reopenedWithDoors(copyCenter)
    expect.soft(project.floors[0]?.openings, name).toMatchObject(source)
    const graph = deriveSceneGraph(project)
    expect.soft(graph.openings, name).toMatchObject(
      source.map(({ id, hostWallId, orientation }) => ({
        id: `opening:${id}`,
        hostWallId,
        orientation,
      })),
    )
    const root = buildScene(graph)
    const owner = findByEntityId(root, `wall:${OWNER}`)
    if (!(owner instanceof Mesh)) throw new Error('Expected the wall mesh that owns the aperture')
    expect.soft(findByEntityId(root, `wall:${COPY}`), name).toBeNull()
    root.updateMatrixWorld(true)

    const westJamb = 1500
    const cutWidth = eastJamb - westJamb
    const expectedFaceArea = WALL_LENGTH * WALL_HEIGHT - cutWidth * DOOR_HEIGHT
    for (const face of ['interiorFace', 'exteriorFace']) {
      expect.soft(roleArea(owner, face), `${name}, ${face}`).toBeCloseTo(expectedFaceArea)
    }
    const expectedRevealArea = (2 * DOOR_HEIGHT + cutWidth) * WALL_THICKNESS
    expect.soft(roleArea(owner, 'reveal'), name).toBeCloseTo(expectedRevealArea)
    if (name === 'coincident doors') {
      expect.soft(roleTriangleCount(owner, 'reveal'), name).toBe(6)
    }

    expectApertureRays(owner, { name, westJamb, eastJamb, voidProbeX })
  }
})

it('keeps the exposed reveals where a saved round-top window meets a raised rectangular window', () => {
  // A 700 mm radius gives the arch a springline at y=1500 and a crown at y=2200.
  // The rectangle spans x=1800..3000 and y=1400..2400.
  const project = reopenedWithOpenings([
    createOpening({
      id: 'round-window',
      hostWallId: OWNER,
      type: 'round-top-window',
      position: 1700,
      width: 1400,
      height: 1600,
      sillHeight: 600,
    }),
    createOpening({
      id: 'raised-window',
      hostWallId: COPY,
      type: 'double-hung-window',
      position: WALL_LENGTH - 2400,
      width: 1200,
      height: 1000,
      sillHeight: 1400,
    }),
  ])
  const graph = deriveSceneGraph(project)
  expect(graph.openings).toMatchObject([
    { id: 'opening:round-window', hostWallId: OWNER, center: { x: 1700, y: 0 } },
    { id: 'opening:raised-window', hostWallId: COPY, center: { x: 2400, y: 0 } },
  ])

  const root = buildScene(graph)
  const owner = findByEntityId(root, `wall:${OWNER}`)
  if (!(owner instanceof Mesh)) throw new Error('Expected the wall mesh that owns the aperture')
  root.updateMatrixWorld(true)

  const passage = [
    { name: 'arch only', x: 1300, y: 1000 },
    { name: 'rectangle only', x: 2800, y: 1900 },
    { name: 'shared void at the curved head', x: 2000, y: 1850 },
    { name: 'exposed curve to the left of the rectangle', x: 1400, y: 2100 },
    { name: 'rectangle above the arch', x: 2000, y: 2300 },
  ]
  for (const { name, x, y } of passage) {
    expect.soft(acrossWall(owner, x, y), name).toHaveLength(0)
  }
  const solidWall = [
    { name: 'outside the arch but inside its bounding box', x: 1300, y: 2100 },
    { name: 'below the rectangular sill', x: 2800, y: 1200 },
    { name: 'above both windows', x: 2000, y: 2450 },
  ]
  for (const { name, x, y } of solidWall) {
    expect.soft(acrossWall(owner, x, y)[0]?.point.z, name).toBeCloseTo(WALL_THICKNESS / 2)
  }

  const alongWall = ([x, y]: [number, number], toX: number) => {
    const origin = owner.position.clone().set(x, y, 17)
    const direction = owner.position.clone().set(Math.sign(toX - x), 0, 0)
    const ray = new Raycaster(origin, direction, 0, Math.abs(toX - x))
    return ray.intersectObject(owner, false).map(({ point }) => point.x)
  }
  expect.soft(alongWall([2000, 1850], 1550), 'past the hidden rectangular jamb').toEqual([])
  expect.soft(alongWall([2000, 1850], 2700), 'past the hidden curved reveal').toEqual([])
  expect.soft(alongWall([2100, 1200], 2450), 'arch jamb below the rectangular sill').toEqual([2400])
  expect.soft(alongWall([2000, 2300], 1750), 'rectangular jamb above the arch').toEqual([1800])

  // At y=2100 the left reveal is at x=1700-sqrt(700²-600²), between 1300 and 1400.
  const outsideCurve = alongWall([1700, 2100], 1300)
  expect.soft(outsideCurve).toHaveLength(1)
  expect.soft(outsideCurve[0]).toBeGreaterThan(1300)
  expect.soft(outsideCurve[0]).toBeLessThan(1400)
})
