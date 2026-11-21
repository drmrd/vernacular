import { describe, it, expect } from 'vitest'
import { PerspectiveCamera, Raycaster } from '../../engine/testing'

import { buildScene } from '../../engine'
import { colorFromHex, planToWorld } from '../../core'
import { createPerceivedColorStore } from '../perceived-color/perceived-color-store'
import { createSelectionStore } from '../selection/selection-store'
import { createSurfaceSelectionStore } from '../selection/surface-selection-store'
import { commitSelectionAt } from './scene-selection'
import type { OpeningSceneNode, Point, SceneGraph, SurfaceRef } from '../../core'

// One pick decides both what a click selects and what it paints (ADR-0056, ADR-0224): the
// nearest object that is not faded takes the click, and an object with no paintable face
// leaves no paint target and no color sample. Every click here is the canvas centre.

const FLOOR_ID = 'g'
const ROOM_SIDE = 4000
const WALL_THICKNESS = 200
const WALL_HEIGHT = 2400
const MIDDLE = ROOM_SIDE / 2
const OVERHEAD = 5000
const STANDOFF = 3000
const EYE_HEIGHT = 1500
const BELOW_CEILING = 1000
const WINDOW = { width: 900, height: 1200, sill: 900 }
const CHAIR_CORNER = 1000
const CHAIR_SPAN = 600
const CHAIR_TOP: Point = { x: CHAIR_CORNER + CHAIR_SPAN / 3, y: CHAIR_CORNER + CHAIR_SPAN / 2 }
const CLEAR_SPOT: Point = { x: 3000, y: 2500 }
const TEE_BAR = 2000
const TEE_LEG = 1000
const TEE: Point = { x: TEE_BAR / 2, y: 0 }
const CANVAS_SIZE = 200
const CANVAS_CENTER = CANVAS_SIZE / 2

const CEILING_REF: SurfaceRef = { kind: 'ceiling', floorId: FLOOR_ID }
const LEFT_FACE: SurfaceRef = { kind: 'wall-face', wallId: 'far', side: 'left' }
const CENTRE_NDC = { x: 0, y: 0 }

const square: Point[] = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE, y: 0 },
  { x: ROOM_SIDE, y: ROOM_SIDE },
  { x: 0, y: ROOM_SIDE },
]

const wallBetween = (id: string, start: Point, end: Point): SceneGraph['walls'][number] => ({
  id,
  kind: 'wall',
  floorId: FLOOR_ID,
  start,
  end,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
})

const roomNode = (id: string, polygon: Point[], ceilingHeight?: number) => ({
  id,
  kind: 'room' as const,
  floorId: FLOOR_ID,
  polygon,
  clearPolygon: polygon,
  area: 1,
  ...(ceilingHeight === undefined ? {} : { ceilingHeight }),
})

const graphOf = (parts: Partial<SceneGraph>): SceneGraph => ({
  nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
  ...parts,
})

const chair: SceneGraph['furniture'][number] = {
  id: 'furniture:chair',
  kind: 'furniture',
  floorId: FLOOR_ID,
  footprintCorners: [
    { x: CHAIR_CORNER, y: CHAIR_CORNER },
    { x: CHAIR_CORNER + CHAIR_SPAN, y: CHAIR_CORNER },
    { x: CHAIR_CORNER + CHAIR_SPAN, y: CHAIR_CORNER + CHAIR_SPAN },
    { x: CHAIR_CORNER, y: CHAIR_CORNER + CHAIR_SPAN },
  ],
  elevationZ: 0,
  height: 900,
  assetRef: { scope: 'user', contentHash: 'hash-of-a-test-piece' },
}

const windowOpening: OpeningSceneNode = {
  id: 'opening:window',
  kind: 'opening',
  floorId: FLOOR_ID,
  type: 'double-hung-window',
  hostWallId: 'near',
  center: { x: MIDDLE, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: WINDOW.width,
  height: WINDOW.height,
  sillHeight: WINDOW.sill,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
}

/** A closed square room with a ceiling, its near wall along plan y = 0. */
const closedRoom = (parts: Partial<SceneGraph> = {}): SceneGraph =>
  graphOf({
    walls: [
      wallBetween('wall:near', { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
      wallBetween('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
      wallBetween('wall:far', { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
      wallBetween('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
    ],
    rooms: [roomNode('room:r1', square, WALL_HEIGHT)],
    ...parts,
  })

/** A bar wall with a partition teed up from its middle: a solid junction fill at the tee. */
const teeJunction = (): SceneGraph =>
  graphOf({
    walls: [
      wallBetween('wall:bar', { x: 0, y: 0 }, { x: TEE_BAR, y: 0 }),
      wallBetween('wall:leg', TEE, { x: TEE.x, y: TEE_LEG }),
    ],
    rooms: [
      roomNode('room:a', [{ x: 0, y: 0 }, TEE, { x: TEE.x, y: TEE_LEG }, { x: 0, y: TEE_LEG }]),
      roomNode('room:b', [
        TEE,
        { x: TEE_BAR, y: 0 },
        { x: TEE_BAR, y: TEE_LEG },
        { x: TEE.x, y: TEE_LEG },
      ]),
    ],
  })

/** A plan point and the height above the floor it stands at. */
type Spot = readonly [Point, number]

function cameraLooking([from, fromHeight]: Spot, [at, atHeight]: Spot) {
  const eye = planToWorld(from, fromHeight)
  const target = planToWorld(at, atHeight)
  const camera = new PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.lookAt(target.x, target.y, target.z)
  camera.updateMatrixWorld(true)
  return camera
}

const lookingDownAt = (plan: Point) => cameraLooking([plan, OVERHEAD], [plan, 0])

const stubCanvas = (): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }),
  }) as unknown as HTMLCanvasElement

const clickAt = (clientX: number, clientY: number, shiftKey = false): PointerEvent =>
  ({ clientX, clientY, shiftKey, metaKey: false, ctrlKey: false }) as unknown as PointerEvent

/** A click session over a built scene. `earlier` leaves the state an earlier face click left. */
function click(
  graph: SceneGraph,
  camera: PerspectiveCamera,
  event = clickAt(CANVAS_CENTER, CANVAS_CENTER),
) {
  const root = buildScene(graph)
  root.updateMatrixWorld(true)
  const selection = createSelectionStore()
  const surfaceSelection = createSurfaceSelectionStore()
  const perceivedColor = createPerceivedColorStore()
  const earlier = (): void => {
    surfaceSelection.select(LEFT_FACE)
    perceivedColor.resolveSample({ surface: LEFT_FACE, color: colorFromHex('#a1b2c3') })
  }
  const run = (): void =>
    commitSelectionAt(event, {
      domElement: stubCanvas(),
      camera,
      raycaster: new Raycaster(),
      root,
      selection,
      surfaceSelection,
      perceivedColor,
    })
  return { selection, surfaceSelection, perceivedColor, earlier, run }
}

describe('commitSelectionAt on an object with no paintable face', () => {
  it('selects furniture, leaves the floor behind it untargeted, and drops the earlier sample', () => {
    const session = click(closedRoom({ furniture: [chair] }), lookingDownAt(CHAIR_TOP))
    session.earlier()

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set(['chair']))
    expect(session.surfaceSelection.getActiveSurface()).toEqual(LEFT_FACE)
    expect(session.perceivedColor.getRequest()).toBeNull()
    expect(session.perceivedColor.getSample()).toBeNull()
  })

  it('selects furniture without a perceived-color store mounted', () => {
    const root = buildScene(closedRoom({ furniture: [chair] }))
    root.updateMatrixWorld(true)
    const selection = createSelectionStore()
    const surfaceSelection = createSurfaceSelectionStore()

    commitSelectionAt(clickAt(CANVAS_CENTER, CANVAS_CENTER), {
      domElement: stubCanvas(),
      camera: lookingDownAt(CHAIR_TOP),
      raycaster: new Raycaster(),
      root,
      selection,
      surfaceSelection,
    })

    expect(selection.getSelectedIds()).toEqual(new Set(['chair']))
    expect(surfaceSelection.getActiveSurface()).toBeNull()
  })

  it('selects the opening and changes no paint target when the click lands on glass in a solid wall', () => {
    const aim = WINDOW.sill + WINDOW.height / 2
    const camera = cameraLooking([{ x: MIDDLE, y: -STANDOFF }, aim], [{ x: MIDDLE, y: 0 }, aim])
    const session = click(closedRoom({ openings: [windowOpening] }), camera)
    session.earlier()

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set(['opening:window']))
    expect(session.surfaceSelection.getActiveSurface()).toEqual(LEFT_FACE)
    expect(session.perceivedColor.getRequest()).toBeNull()
    expect(session.perceivedColor.getSample()).toBeNull()
  })
})

describe('commitSelectionAt on a ceiling', () => {
  it('selects the room, makes its ceiling the paint target, and requests a sample of it', () => {
    const camera = cameraLooking([CLEAR_SPOT, BELOW_CEILING], [CLEAR_SPOT, WALL_HEIGHT])
    const session = click(closedRoom(), camera)

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set(['room:r1']))
    expect(session.surfaceSelection.getActiveSurface()).toEqual(CEILING_REF)
    expect(session.perceivedColor.getRequest()).toEqual({ surface: CEILING_REF, ndc: CENTRE_NDC })
  })
})

describe('commitSelectionAt on a junction fill and on empty space', () => {
  it('clears the selection and keeps the paint target when the click lands on a junction fill', () => {
    const session = click(teeJunction(), lookingDownAt(TEE))
    session.selection.select('wall:bar')
    session.earlier()

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set())
    expect(session.surfaceSelection.getActiveSurface()).toEqual(LEFT_FACE)
  })

  it('leaves the selection as it was when a modifier click lands on a junction fill', () => {
    const event = clickAt(CANVAS_CENTER, CANVAS_CENTER, true)
    const session = click(teeJunction(), lookingDownAt(TEE), event)
    session.selection.select('wall:bar')

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set(['wall:bar']))
  })

  it('clears the selection and keeps the paint target when the click lands on empty space', () => {
    // A level ray from the lawn away from the room strikes nothing at all.
    const away = cameraLooking(
      [{ x: MIDDLE, y: -STANDOFF }, EYE_HEIGHT],
      [{ x: MIDDLE, y: -2 * STANDOFF }, EYE_HEIGHT],
    )
    const session = click(closedRoom(), away)
    session.selection.select('room:r1')
    session.earlier()

    session.run()

    expect(session.selection.getSelectedIds()).toEqual(new Set())
    expect(session.surfaceSelection.getActiveSurface()).toEqual(LEFT_FACE)
  })
})
