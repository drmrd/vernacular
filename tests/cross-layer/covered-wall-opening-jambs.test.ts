import { expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  decodeDocument,
  deriveSceneGraph,
  encodeDocument,
  type SceneGraph,
} from '../../core'
import { drawPlan } from '../../editor/plan/draw-plan'
import { recordingContext } from '../../editor/plan/draw-plan-test-fixtures'
import { toDrawableOpenings } from '../../editor/plan/drawable-openings'
import { swingLeafGeometry } from '../../editor/plan/opening-geometry'
import { DEFAULT_PLAN_PALETTE } from '../../editor/plan/plan-palette'

const OWNERSHIP_BOUNDARY = 4000
const HOST_START = 5000
const OWNER_THICKNESS = 120
const HOST_THICKNESS = 300
const DOOR_WIDTH = 600
const WALL_LINE_Y = 700
const VIEWPORT = { scale: 1, offset: { x: 0, y: WALL_LINE_Y } }

function savedDoorAt(center: number, authoredWall: 'owner' | 'tail' = 'tail') {
  const origin = { x: 0, y: 0 }
  const owner = createWall(
    origin,
    { x: OWNERSHIP_BOUNDARY, y: 0 },
    {
      id: 'owner',
      thickness: OWNER_THICKNESS,
    },
  )
  const host = createWall({ x: HOST_START, y: 0 }, origin, {
    id: 'host',
    thickness: HOST_THICKNESS,
  })
  const door = createOpening({
    id: 'door',
    type: 'single-swing-door',
    hostWallId: authoredWall === 'owner' ? owner.id : host.id,
    position: authoredWall === 'owner' ? center : HOST_START - center,
    width: DOOR_WIDTH,
    height: 2000,
    orientation: { hinge: 'start', facing: 'positive' },
  })
  const floor = createFloor('Ground', { id: 'ground', walls: [owner, host] })
  const project = {
    ...createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    }),
    floors: [{ ...floor, openings: [door] }],
  }
  const decoded = decodeDocument(encodeDocument(project, undefined).bytes)
  if (!decoded.ok) throw new Error(`Could not reopen the fixture: ${decoded.failure.kind}`)
  return decoded.value.project
}

function renderPlan(graph: SceneGraph) {
  const plan = recordingContext()
  drawPlan(plan.ctx, {
    walls: graph.walls,
    openings: toDrawableOpenings(graph.openings, new Set()),
    viewport: VIEWPORT,
    width: HOST_START + 200,
    height: 1000,
    selectedIds: new Set(),
  })
  return plan
}

function jambEnds(plan: ReturnType<typeof recordingContext>, x: number): number[] {
  const ends = plan.segments
    .filter(
      ({ from, to, style }) =>
        style === DEFAULT_PLAN_PALETTE.wall &&
        from[0] === x &&
        to[0] === x &&
        Math.min(from[1], to[1]) < WALL_LINE_Y &&
        Math.max(from[1], to[1]) > WALL_LINE_Y,
    )
    .flatMap(({ from, to }) => [from[1], to[1]])
  return [...new Set(ends)].sort((a, b) => a - b)
}

it('ends each saved door jamb at the wall faces beside that jamb', () => {
  for (const center of [OWNERSHIP_BOUNDARY - 100, OWNERSHIP_BOUNDARY, OWNERSHIP_BOUNDARY + 100]) {
    const graph = deriveSceneGraph(savedDoorAt(center))
    const plan = renderPlan(graph)

    const westJamb = center - DOOR_WIDTH / 2
    const eastJamb = center + DOOR_WIDTH / 2
    expect.soft(jambEnds(plan, westJamb), `west jamb, center ${center}`).toEqual([640, 760])
    expect.soft(jambEnds(plan, eastJamb), `east jamb, center ${center}`).toEqual([550, 850])

    const [door] = graph.openings
    if (door === undefined) throw new Error('Expected the saved door in the scene')
    expect.soft(swingLeafGeometry(door), `handing at ${center}`).toMatchObject({
      hinge: { x: eastJamb, y: 0 },
      closed: { x: westJamb, y: 0 },
      leafEnd: { x: eastJamb, y: -DOOR_WIDTH },
    })
  }
})

it('draws the full door jamb when the adjoining wall continues beyond the door host', () => {
  const center = OWNERSHIP_BOUNDARY - DOOR_WIDTH / 2
  const plan = renderPlan(deriveSceneGraph(savedDoorAt(center, 'owner')))

  expect.soft(jambEnds(plan, OWNERSHIP_BOUNDARY - DOOR_WIDTH), 'west jamb').toEqual([640, 760])
  expect.soft(jambEnds(plan, OWNERSHIP_BOUNDARY), 'east jamb').toEqual([550, 850])
})
