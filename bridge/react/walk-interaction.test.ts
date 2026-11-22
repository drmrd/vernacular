import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  toggleOpening,
  type OpeningPose,
  type OpeningSceneNode,
  type SceneGraph,
  type WalkState,
} from '../../core'
import { buildScene, NeutralMaterialProvider, type SceneRoot } from '../../engine'

import {
  followStoredOpenings,
  interactFromWalk,
  restoreOpenings,
  tickOpenings,
} from './walk-interaction'
import { openPartsWith } from '../open-parts-test-support'

const DOOR_ID = 'opening:front-door'
const DOOR_REF = { openingId: DOOR_ID, part: 'primary' } as const

// True when any object below the group sits above its built position. The traversal
// visits the group first, so it is skipped.
function someDescendantRisen(group: {
  traverse: (visit: (child: { position: { y: number } }) => void) => void
}): boolean {
  let visited = 0
  let risen = false
  group.traverse((child) => {
    visited += 1
    if (visited > 1 && child.position.y > 0) risen = true
  })
  return risen
}

// A door whose wall runs along world X at world Z = -2000 (plan y maps to world -z).
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

// Standing 1000mm in front of the door, eye at standing height, looking down -Z
// straight at the door at world z = -2000 (plan y maps to world -z).
const facingDoor: WalkState = { position: { x: 1000, y: 1700, z: -1000 }, yaw: 0, pitch: 0 }

// A whole-second tick covers the full swing in one step.
const FULL_STEP = 1

const FULLY_OPEN = 1

// The pose an opening's fill group sits at, as plain numbers, so two independently
// built scenes can be compared for the same pose.
function fillGroupPose(root: SceneRoot, openingId: string) {
  const group = root.getObjectByName(openingId)
  if (group === undefined) {
    throw new Error(`no fill group was built for ${openingId}`)
  }
  return {
    position: { x: group.position.x, y: group.position.y, z: group.position.z },
    rotationY: group.rotation.y,
  }
}

function sceneWith(door: OpeningSceneNode): SceneRoot {
  return buildScene(graphWith(door), new NeutralMaterialProvider())
}

describe('walk interaction', () => {
  it('opens the looked-at opening, swings its fill group, then closes it on a second use', () => {
    const door = frontDoor()
    const root = buildScene(graphWith(door), new NeutralMaterialProvider())
    const group = root.getObjectByName(DOOR_ID)
    expect(group).toBeDefined()
    if (group === undefined) return
    const openness = new Map<string, OpeningPose>()

    const opened = interactFromWalk(facingDoor, [door], emptyOpeningInteraction())
    expect(isOpeningOpen(opened, DOOR_ID)).toBe(true)

    tickOpenings({ root, openings: [door], interaction: opened, openness }, FULL_STEP)
    expect(openness.get(DOOR_ID)?.primary).toBe(1)
    // The fill group has swung off its built pose.
    expect(group.position.length()).toBeGreaterThan(0)

    const closed = interactFromWalk(facingDoor, [door], opened, openness)
    expect(isOpeningOpen(closed, DOOR_ID)).toBe(false)

    tickOpenings({ root, openings: [door], interaction: closed, openness }, FULL_STEP)
    expect(openness.get(DOOR_ID)?.primary).toBe(0)
    expect(group.position.length()).toBeCloseTo(0, 3)
  })

  it('opens the primary part of the looked-at door', () => {
    const door = frontDoor()

    const opened = interactFromWalk(facingDoor, [door], emptyOpeningInteraction())

    expect(opened.openParts.get(DOOR_ID)).toEqual(new Set(['primary']))
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
    const openness = new Map<string, OpeningPose>()

    const opened = toggleOpening(emptyOpeningInteraction(), { openingId: window.id, part: 'lower' })
    tickOpenings({ root, openings: [window], interaction: opened, openness }, FULL_STEP)

    expect(openness.get(window.id)?.lower).toBe(1)
    // A hung window raises its lower sash inside the group; the swing path would have
    // turned the whole group instead.
    expect(group.rotation.y).toBe(0)
    expect(someDescendantRisen(group)).toBe(true)
  })

  it('leaves every opening shut when the walker looks at none within reach', () => {
    const door = frontDoor()
    // facingDoor looks down -Z at the door, so a half turn (yaw PI) looks away.
    const lookingAway: WalkState = { ...facingDoor, yaw: Math.PI }

    const result = interactFromWalk(lookingAway, [door], emptyOpeningInteraction())

    expect(isOpeningOpen(result, DOOR_ID)).toBe(false)
  })

  it('closes an already-open leaf the walker looks at when openness is threaded', () => {
    const door = frontDoor()

    // frontDoor: hinge `start`, facing `positive`, wall along world X at world
    // Z = -2000, width 900, height 2032, sill 0 (plan y maps to world -z).
    // - SHUT, the leaf lies in the world plane z = -2000.
    // - At openness 1 the leaf has swung a quarter turn about its hinge jamb to
    //   stand in the world plane x = 550, centered at {x:550, y:1016, z:-1550},
    //   spanning z in [-2000, -1100] and y in [0, 2032].
    //
    // A walker standing at {x:200, y:1700, z:-1550} looking due +x. With this
    // codebase's yaw convention (walkLookDirection: x = sin(yaw)cos(pitch),
    // z = -cos(yaw)cos(pitch)), looking +x is yaw: PI/2, pitch: 0. That ray
    // crosses the OPEN leaf plane (x=550) at 350mm (within reach) inside the
    // leaf, but runs exactly PARALLEL to the shut aperture plane (z=-2000), so
    // the shut leaf is missed.
    const aimedAtSwungLeaf: WalkState = {
      position: { x: 200, y: 1700, z: -1550 },
      yaw: Math.PI / 2,
      pitch: 0,
    }

    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)
    expect(isOpeningOpen(open, DOOR_ID)).toBe(true)

    // With the leaf's openness threaded, the ray tests the swung leaf at x=550,
    // hits it, and toggles the open door shut.
    const closed = interactFromWalk(
      aimedAtSwungLeaf,
      [door],
      open,
      new Map([[DOOR_ID, { primary: 1 }]]),
    )
    expect(isOpeningOpen(closed, DOOR_ID)).toBe(false)

    // Without openness, the ray only tests the shut aperture plane (z=-2000),
    // which it runs parallel to, so it misses the swung leaf and toggles nothing.
    const stillOpen = interactFromWalk(aimedAtSwungLeaf, [door], open)
    expect(isOpeningOpen(stillOpen, DOOR_ID)).toBe(true)
  })
})

describe('restoreOpenings', () => {
  it('shows a door carried in from a saved session already open, not swinging from shut', () => {
    // Two scenes of the same door: one swung open a frame at a time, one restored
    // in a single step. The restored door must land on the same open pose.
    const door = frontDoor()
    const swungOpen = sceneWith(door)
    const restored = sceneWith(door)
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)
    const openness = new Map<string, OpeningPose>()

    tickOpenings(
      { root: swungOpen, openings: [door], interaction: open, openness: new Map() },
      FULL_STEP,
    )
    restoreOpenings({ root: restored, openings: [door], interaction: open, openness })

    expect(openness.get(DOOR_ID)?.primary).toBe(FULLY_OPEN)
    expect(fillGroupPose(restored, DOOR_ID)).toEqual(fillGroupPose(swungOpen, DOOR_ID))
  })

  it('leaves an opening the saved session did not hold open at its built pose', () => {
    const door = frontDoor()
    const root = sceneWith(door)
    const builtPose = fillGroupPose(root, DOOR_ID)
    const openness = new Map<string, OpeningPose>()

    restoreOpenings({ root, openings: [door], interaction: emptyOpeningInteraction(), openness })

    expect(openness.has(DOOR_ID)).toBe(false)
    expect(fillGroupPose(root, DOOR_ID)).toEqual(builtPose)
  })

  it('leaves an opening already part way through its swing at the openness it carries', () => {
    const door = frontDoor()
    const root = sceneWith(door)
    const partWayOpen = 0.25
    const openness = new Map([[DOOR_ID, { primary: partWayOpen }]])

    restoreOpenings({
      root,
      openings: [door],
      interaction: toggleOpening(emptyOpeningInteraction(), DOOR_REF),
      openness,
    })

    expect(openness.get(DOOR_ID)?.primary).toBe(partWayOpen)
  })

  it('poses a rebuilt scene at the openness a door carried, while the session holds it open', () => {
    const door = frontDoor()
    const earlierScene = sceneWith(door)
    const rebuiltScene = sceneWith(door)
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)
    const openness = new Map<string, OpeningPose>()

    tickOpenings({ root: earlierScene, openings: [door], interaction: open, openness }, FULL_STEP)
    restoreOpenings({ root: rebuiltScene, openings: [door], interaction: open, openness })

    expect(fillGroupPose(rebuiltScene, DOOR_ID)).toEqual(fillGroupPose(earlierScene, DOOR_ID))
  })

  it('poses a rebuilt scene at the carried openness even after the session let go of the door', () => {
    const door = frontDoor()
    const earlierScene = sceneWith(door)
    const rebuiltScene = sceneWith(door)
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)
    const openness = new Map<string, OpeningPose>()

    tickOpenings({ root: earlierScene, openings: [door], interaction: open, openness }, FULL_STEP)
    restoreOpenings({
      root: rebuiltScene,
      openings: [door],
      interaction: emptyOpeningInteraction(),
      openness,
    })

    expect(fillGroupPose(rebuiltScene, DOOR_ID)).toEqual(fillGroupPose(earlierScene, DOOR_ID))
    expect(openness.get(DOOR_ID)?.primary).toBe(FULLY_OPEN)
  })
})

describe('followStoredOpenings', () => {
  it('closes every door when the session store holds none open', () => {
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)

    const followed = followStoredOpenings(open, new Map())

    expect(isOpeningOpen(followed, DOOR_ID)).toBe(false)
  })

  it('leaves the interaction as it is when the store holds the same doors open', () => {
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)

    const followed = followStoredOpenings(open, openPartsWith({ [DOOR_ID]: ['primary'] }))

    expect(followed).toBe(open)
  })

  it('opens a door the store holds open that the interaction lacks, holding a copy of the stored map', () => {
    const stored = openPartsWith({ [DOOR_ID]: ['primary'] })

    const followed = followStoredOpenings(emptyOpeningInteraction(), stored)

    expect(isOpeningOpen(followed, DOOR_ID)).toBe(true)
    expect(followed.openParts).not.toBe(stored)
  })

  it('swaps to the stored door when the interaction and the store hold equal counts of different doors', () => {
    const otherDoorId = 'opening:back-door'
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)

    const followed = followStoredOpenings(open, openPartsWith({ [otherDoorId]: ['primary'] }))

    expect(isOpeningOpen(followed, otherDoorId)).toBe(true)
    expect(isOpeningOpen(followed, DOOR_ID)).toBe(false)
  })

  it('lets a door that was swung fully open swing back to its built pose once the store closes it', () => {
    const door = frontDoor()
    const root = sceneWith(door)
    const builtPose = fillGroupPose(root, DOOR_ID)
    const openness = new Map([[DOOR_ID, { primary: FULLY_OPEN }]])
    const open = toggleOpening(emptyOpeningInteraction(), DOOR_REF)

    const followed = followStoredOpenings(open, new Map())
    tickOpenings({ root, openings: [door], interaction: followed, openness }, FULL_STEP)

    expect(openness.get(DOOR_ID)?.primary).toBe(0)
    expect(fillGroupPose(root, DOOR_ID)).toEqual(builtPose)
  })

  it('keeps the same state for a stored map with the same parts', () => {
    const open = toggleOpening(emptyOpeningInteraction(), { openingId: 'w', part: 'upper' })
    const sameParts = openPartsWith({ w: ['upper'] })

    expect(followStoredOpenings(open, sameParts)).toBe(open)
  })

  it('copies a stored map with other parts', () => {
    const open = toggleOpening(emptyOpeningInteraction(), { openingId: 'w', part: 'lower' })
    const otherParts = openPartsWith({ w: ['upper'] })

    const followed = followStoredOpenings(open, otherParts)

    expect(followed.openParts).toEqual(otherParts)
    expect(followed.openParts).not.toBe(otherParts)
  })
})
