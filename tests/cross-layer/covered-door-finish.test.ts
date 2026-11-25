import { expect, it } from 'vitest'
import {
  colorFromHex,
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  decodeDocument,
  deriveSceneGraph,
  encodeDocument,
  solidTreatment,
} from '../../core'
import { drawPlan } from '../../editor/plan/draw-plan'
import { recordingContext } from '../../editor/plan/draw-plan-test-fixtures'
import { toDrawableOpenings } from '../../editor/plan/drawable-openings'
import { DEFAULT_PLAN_PALETTE } from '../../editor/plan/plan-palette'

it('breaks the thick owner finish at the jambs of a saved door on the reversed cover', () => {
  const floor = createFloor('Ground', {
    id: 'ground',
    walls: [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'owner', thickness: 300 }),
      createWall({ x: 4000, y: 0 }, { x: 0, y: 0 }, { id: 'cover', thickness: 120 }),
    ],
  })
  floor.openings = [
    createOpening({
      id: 'door',
      hostWallId: 'cover',
      type: 'single-swing-door',
      position: 1000,
      width: 600,
    }),
  ]
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [floor]
  const decoded = decodeDocument(encodeDocument(project, undefined).bytes)
  if (!decoded.ok) throw new Error(`Could not reopen the fixture: ${decoded.failure.kind}`)

  const graph = deriveSceneGraph(decoded.value.project)
  const sage = '#9aa583'
  const finish = solidTreatment(colorFromHex(sage), 'satin')
  const plan = recordingContext()
  drawPlan(plan.ctx, {
    walls: graph.walls,
    openings: toDrawableOpenings(graph.openings, new Set()),
    viewport: { scale: 1, offset: { x: 0, y: 200 } },
    width: 4200,
    height: 400,
    selectedIds: new Set(),
    surfacePaint: {
      activeSurface: null,
      treatmentForFace: (wallId, side) =>
        wallId === 'owner' && side === 'left' ? finish : undefined,
    },
  })

  const faceY = 50
  const expected = [
    { from: [0, faceY], to: [2700, faceY] },
    { from: [3300, faceY], to: [4000, faceY] },
  ]
  const faceLines = plan.segments.filter(
    ({ from, to, style }) =>
      style === DEFAULT_PLAN_PALETTE.wall &&
      from[1] === faceY &&
      to[1] === faceY &&
      from[0] !== to[0],
  )
  expect(faceLines.map(({ from, to }) => ({ from, to }))).toEqual(expected)
  const finishBands = plan.segments.filter(({ style }) => style === sage)
  expect(finishBands.map(({ from, to }) => ({ from, to }))).toEqual(expected)
})
