import { expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createSceneGraphDeriver,
  createWall,
  decodeDocument,
  deriveFloorPlanGeometry,
  deriveSceneGraph,
  encodeDocument,
  type Floor,
  type Project,
  type SceneGraph,
} from '../../core'
import { drawPlan } from '../../editor/plan/draw-plan'
import { recordingContext } from '../../editor/plan/draw-plan-test-fixtures'
import { toDrawableOpenings } from '../../editor/plan/drawable-openings'
import { swingLeafGeometry } from '../../editor/plan/opening-geometry'
import { DEFAULT_PLAN_PALETTE } from '../../editor/plan/plan-palette'
import { buildScene } from '../../engine'
import { maxAxisOfRole, roleArea } from '../../engine/scene/wall-test-support'
import { findByEntityId, Mesh, Raycaster } from '../../engine/testing'

const OWNER = 'owner'
const COPY = 'copy'
const DOOR = 'door'
const WALL_LENGTH = 4000
const WALL_HEIGHT = 2600
const OWNER_THICKNESS = 120
const COPY_THICKNESS = 300
const DOOR_POSITION = 1000
const DOOR_WIDTH = 600
const DOOR_HEIGHT = 2000
const HANDING = { hinge: 'start', facing: 'positive' } as const
const VIEWPORT = { scale: 1, offset: { x: 0, y: 200 } }

function floorWithDoor(copyStart = WALL_LENGTH): Floor {
  const owner = createWall(
    { x: 0, y: 0 },
    { x: WALL_LENGTH, y: 0 },
    {
      id: OWNER,
      thickness: OWNER_THICKNESS,
    },
  )
  const copy = createWall(
    { x: copyStart, y: 0 },
    { x: 0, y: 0 },
    {
      id: COPY,
      thickness: COPY_THICKNESS,
    },
  )
  const door = createOpening({
    id: DOOR,
    type: 'single-swing-door',
    hostWallId: COPY,
    position: DOOR_POSITION,
    width: DOOR_WIDTH,
    height: DOOR_HEIGHT,
    orientation: HANDING,
  })
  return {
    ...createFloor('Ground', {
      id: 'ground',
      walls: [owner, copy],
      defaultCeilingHeight: WALL_HEIGHT,
    }),
    openings: [door],
  }
}

function projectWith(floor: Floor): Project {
  return {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [floor],
  }
}

function reopened(project: Project): Project {
  const decoded = decodeDocument(encodeDocument(project, undefined).bytes)
  if (!decoded.ok) throw new Error(`Could not reopen the fixture: ${decoded.failure.kind}`)
  return decoded.value.project
}

function spansByWall(floor: Floor) {
  const { network, openingSpans } = deriveFloorPlanGeometry(floor)
  return openingSpans.map(({ edgeIndex, ...span }) => ({
    ...span,
    wallId: network.edges[edgeIndex]?.wallId,
  }))
}

function expectDoorProjection(graph: SceneGraph, thickness: number, context: string): void {
  expect.soft(graph.openings, context).toMatchObject([
    {
      id: `opening:${DOOR}`,
      hostWallId: COPY,
      center: { x: 3000, y: 0 },
      along: { x: -1, y: 0 },
      normal: { x: 0, y: -1 },
      orientation: HANDING,
      hostThickness: thickness,
    },
  ])
}

function expectPlanCut(graph: SceneGraph): void {
  const plan = recordingContext()
  drawPlan(plan.ctx, {
    walls: graph.walls,
    openings: toDrawableOpenings(graph.openings, new Set()),
    viewport: VIEWPORT,
    width: 4200,
    height: 400,
    selectedIds: new Set(),
  })

  expect.soft(plan.fills.filter((fill) => fill === DEFAULT_PLAN_PALETTE.poche)).toHaveLength(2)
  const wallInk = plan.segments.filter(({ style }) => style === DEFAULT_PLAN_PALETTE.wall)
  for (const y of [140, 260]) {
    const lengths = wallInk
      .filter(({ from, to }) => from[1] === y && to[1] === y && from[0] !== to[0])
      .map(({ from, to }) => [Math.min(from[0], to[0]), Math.max(from[0], to[0])] as const)
      .sort(([left], [right]) => left - right)
    expect.soft(lengths, `wall face at y=${y}`).toEqual([
      [0, 2700],
      [3300, 4000],
    ])
  }
  for (const x of [2700, 3300]) {
    const jambs = wallInk
      .filter(({ from, to }) => from[0] === x && to[0] === x && from[1] !== to[1])
      .map(({ from, to }) => [Math.min(from[1], to[1]), Math.max(from[1], to[1])])
    expect.soft(jambs, `jamb at x=${x}`).toContainEqual([140, 260])
    expect.soft(jambs, `jamb at x=${x}`).not.toContainEqual([50, 350])
  }
}

function expectWallMeshCut(graph: SceneGraph): void {
  const root = buildScene(graph)
  const ownerMeshes: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh && object.userData.entityId === `wall:${OWNER}`) {
      ownerMeshes.push(object)
    }
  })
  expect.soft(ownerMeshes).toHaveLength(1)
  const [owner] = ownerMeshes
  expect.soft(findByEntityId(root, `wall:${COPY}`)).toBeNull()
  expect.soft(findByEntityId(root, `opening:${DOOR}`)?.children.length).toBeGreaterThan(0)
  if (owner === undefined) return

  const cutFaceArea = WALL_LENGTH * WALL_HEIGHT - DOOR_WIDTH * DOOR_HEIGHT
  const revealArea = (2 * DOOR_HEIGHT + DOOR_WIDTH) * OWNER_THICKNESS
  expect.soft(roleArea(owner, 'interiorFace')).toBeCloseTo(cutFaceArea)
  expect.soft(roleArea(owner, 'reveal')).toBeCloseTo(revealArea)
  expect.soft(maxAxisOfRole(owner, 'reveal', 'x')).toBeCloseTo(3300)
  expect.soft(maxAxisOfRole(owner, 'reveal', 'z')).toBeCloseTo(60)

  root.updateMatrixWorld(true)
  const faceHits = (x: number) => {
    const origin = owner.position.clone().set(x, 1000, 1000)
    const direction = owner.position.clone().set(0, 0, -1)
    return new Raycaster(origin, direction).intersectObject(owner, false)
  }
  expect.soft(faceHits(3000), 'through the doorway').toHaveLength(0)
  for (const x of [2600, 3400]) {
    expect.soft(faceHits(x)[0]?.point.z, `solid wall at x=${x}`).toBeCloseTo(60)
  }
}

function expectExposedTailToKeepItsOpening(): void {
  const floor = floorWithDoor(6000)
  expect
    .soft(spansByWall(floor))
    .toEqual([{ openingId: DOOR, wallId: COPY, fromMm: 700, toMm: 1300 }])
  expect
    .soft(deriveSceneGraph(projectWith(floor)).openings)
    .toMatchObject([{ center: { x: 5000, y: 0 }, hostThickness: COPY_THICKNESS, hostWallId: COPY }])
}

it('cuts a saved door into the wall that owns the overlap and preserves the authored handing', () => {
  const project = reopened(projectWith(floorWithDoor()))
  const [floor] = project.floors
  if (floor === undefined) throw new Error('Expected the saved ground floor')
  expect
    .soft(spansByWall(floor))
    .toEqual([{ openingId: DOOR, wallId: OWNER, fromMm: 2700, toMm: 3300 }])

  const graph = deriveSceneGraph(project)
  const derive = createSceneGraphDeriver()
  expectDoorProjection(graph, OWNER_THICKNESS, 'pure projection')
  expectDoorProjection(derive(project), OWNER_THICKNESS, 'cold memoized projection')
  const thickerOwner = 160
  const walls = floor.walls.map((wall) =>
    wall.id === OWNER ? { ...wall, thickness: thickerOwner } : wall,
  )
  expectDoorProjection(
    derive({ ...project, floors: [{ ...floor, walls }] }),
    thickerOwner,
    'warm projection after editing the owner',
  )

  const [door] = graph.openings
  if (door === undefined) throw new Error('Expected the saved door in the scene')
  expect.soft(swingLeafGeometry(door)).toMatchObject({
    hinge: { x: 3300, y: 0 },
    closed: { x: 2700, y: 0 },
    leafEnd: { x: 3300, y: -600 },
  })
  expectPlanCut(graph)
  expectWallMeshCut(graph)
  expectExposedTailToKeepItsOpening()
  expect
    .soft(reopened(project).floors[0]?.openings)
    .toMatchObject([{ id: DOOR, hostWallId: COPY, position: DOOR_POSITION, orientation: HANDING }])
})
