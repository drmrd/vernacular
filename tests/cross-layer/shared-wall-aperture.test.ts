import { expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  decodeDocument,
  deriveSceneGraph,
  encodeDocument,
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
  floor.openings = source.map((opening) =>
    createOpening({
      ...opening,
      type: 'single-swing-door',
      width: DOOR_WIDTH,
      height: DOOR_HEIGHT,
      sillHeight: 0,
    }),
  )
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [floor]

  const decoded = decodeDocument(encodeDocument(project, undefined).bytes)
  if (!decoded.ok) throw new Error(`Could not reopen the fixture: ${decoded.failure.kind}`)
  return { project: decoded.value.project, source }
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
  const acrossWall = (x: number, height: number) => {
    const from = owner.position.clone().set(x, height, 1000)
    const direction = owner.position.clone().set(0, 0, -1)
    return new Raycaster(from, direction).intersectObject(owner, false)
  }
  for (const x of [westJamb + 1, voidProbeX, eastJamb - 1]) {
    expect
      .soft(acrossWall(x, OPEN_HEIGHT), `${name}, through the opening at x=${x}`)
      .toHaveLength(0)
  }
  for (const x of [westJamb - 1, eastJamb + 1]) {
    expect
      .soft(acrossWall(x, OPEN_HEIGHT)[0]?.point.z, `${name}, outside at x=${x}`)
      .toBeCloseTo(WALL_THICKNESS / 2)
  }
  expect
    .soft(acrossWall(voidProbeX, DOOR_HEIGHT + 1)[0]?.point.z, `${name}, above the doors`)
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
