import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  toggleOpening,
  type OpeningSceneNode,
  type SceneGraph,
  type WalkState,
} from '../../core'
import { buildScene, NeutralMaterialProvider } from '../../engine'

import { interactFromWalk, tickOpenings } from './walk-interaction'

const DOOR_ID = 'opening:front-door'

// A door whose wall runs along world X at world Z = 2000 (plan y maps to world z).
function frontDoor(): OpeningSceneNode {
  return {
    id: DOOR_ID,
    kind: 'opening',
    floorId: 'g',
    type: 'single-swing-door',
    center: { x: 1000, y: 2000 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

function graphWith(door: OpeningSceneNode): SceneGraph {
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: [],
    rooms: [],
    underlays: [],
    openings: [door],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Standing 1000mm in front of the door, eye at standing height, yawed a half turn
// so the look direction points down +Z straight at the door.
const facingDoor: WalkState = { position: { x: 1000, y: 1700, z: 1000 }, yaw: Math.PI, pitch: 0 }

// A whole-second tick covers the full swing in one step.
const FULL_STEP = 1

describe('walk interaction', () => {
  it('opens the looked-at opening, swings its fill group, then closes it on a second use', () => {
    const door = frontDoor()
    const root = buildScene(graphWith(door), new NeutralMaterialProvider())
    const group = root.getObjectByName(DOOR_ID)
    expect(group).toBeDefined()
    if (group === undefined) return
    const openness = new Map<string, number>()

    const opened = interactFromWalk(facingDoor, [door], emptyOpeningInteraction())
    expect(isOpeningOpen(opened, DOOR_ID)).toBe(true)

    tickOpenings({ root, openings: [door], interaction: opened, openness }, FULL_STEP)
    expect(openness.get(DOOR_ID)).toBe(1)
    // The fill group has swung off its built pose.
    expect(group.position.length()).toBeGreaterThan(0)

    const closed = interactFromWalk(facingDoor, [door], opened)
    expect(isOpeningOpen(closed, DOOR_ID)).toBe(false)

    tickOpenings({ root, openings: [door], interaction: closed, openness }, FULL_STEP)
    expect(openness.get(DOOR_ID)).toBe(0)
    expect(group.position.length()).toBeCloseTo(0, 3)
  })

  it('raises a window sash instead of swinging it when ticked open', () => {
    const window: OpeningSceneNode = {
      ...frontDoor(),
      id: 'opening:front-window',
      type: 'double-hung-window',
      height: 1200,
      sillHeight: 900,
    }
    const root = buildScene(graphWith(window), new NeutralMaterialProvider())
    const group = root.getObjectByName(window.id)
    expect(group).toBeDefined()
    if (group === undefined) return
    const openness = new Map<string, number>()

    const opened = toggleOpening(emptyOpeningInteraction(), window.id)
    tickOpenings({ root, openings: [window], interaction: opened, openness }, FULL_STEP)

    expect(openness.get(window.id)).toBe(1)
    // A hung window slides its sash up; the swing path would have left y at 0.
    expect(group.position.y).toBeGreaterThan(0)
  })

  it('leaves every opening shut when the walker looks at none within reach', () => {
    const door = frontDoor()
    const lookingAway: WalkState = { ...facingDoor, yaw: 0 }

    const result = interactFromWalk(lookingAway, [door], emptyOpeningInteraction())

    expect(isOpeningOpen(result, DOOR_ID)).toBe(false)
  })
})
