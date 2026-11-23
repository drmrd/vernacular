import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  type OpeningPose,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'

import { aimFromWalk, type WalkAim } from './walk-aim'
import { interactFromWalk } from './walk-interaction'
import { walkStateOnFloor } from './walk-session'

// A door whose wall runs along world X at world Z = -2000 (plan y maps to world -z).
const door: OpeningSceneNode = {
  id: 'opening:front-door',
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

// The same place, a double-hung window whose meeting rail sits 630 above the sill (world y 1530).
const hungWindow: OpeningSceneNode = {
  ...door,
  id: 'opening:front-window',
  type: 'double-hung-window',
  height: 1200,
  sillHeight: 900,
}

// Standing 1000mm in front of the wall, eye at standing height, looking straight at it.
const facingWall: WalkState = { position: { x: 1000, y: 1700, z: -1000 }, yaw: 0, pitch: 0 }

const GROUND_FLOOR_MM = 0
const UPPER_FLOOR_MM = 3000
const UPPER_EYE_MM = 4700

const DOOR_BAND = { bottomMm: 0, topMm: 2032 }
const LOWER_SASH_BAND = { bottomMm: 0, topMm: 630 }
const UPPER_SASH_BAND = { bottomMm: 630, topMm: 1200 }

// The corners of a frame band on the wall plane, bottom start, bottom end, top end, top start.
function frameCorners(bottomMm: number, topMm: number): WalkAim['outline'] {
  return [
    { x: 550, y: bottomMm, z: -2000 },
    { x: 1450, y: bottomMm, z: -2000 },
    { x: 1450, y: topMm, z: -2000 },
    { x: 550, y: topMm, z: -2000 },
  ]
}

function aimAt(
  walk: WalkState,
  node: OpeningSceneNode,
  options: { floorElevationMm?: number; openness?: ReadonlyMap<string, OpeningPose> } = {},
): WalkAim | null {
  return aimFromWalk({
    walk,
    openings: [node],
    openness: options.openness,
    floorElevationMm: options.floorElevationMm ?? GROUND_FLOOR_MM,
  })
}

describe('aimFromWalk', () => {
  it('aims at the door the walker faces within reach', () => {
    const aim = aimAt(facingWall, door)

    expect(aim).toEqual({
      hit: { openingId: door.id, part: 'primary', band: DOOR_BAND },
      outline: frameCorners(0, 2032),
    })
  })

  it('names the opening and part that the open key toggles', () => {
    const aim = aimAt(facingWall, door)
    const opened = interactFromWalk(
      walkStateOnFloor(facingWall, GROUND_FLOOR_MM),
      [door],
      emptyOpeningInteraction(),
    )

    expect(aim).not.toBeNull()
    expect(isOpeningOpen(opened, aim?.hit.openingId ?? '')).toBe(true)
    expect(opened.openParts.get(aim?.hit.openingId ?? '')).toEqual(new Set([aim?.hit.part]))
  })

  it("lifts the outline to the walker's floor", () => {
    const upstairs: WalkState = {
      ...facingWall,
      position: { ...facingWall.position, y: UPPER_EYE_MM },
    }

    const aim = aimAt(upstairs, door, { floorElevationMm: UPPER_FLOOR_MM })

    expect(aim?.hit).toEqual({ openingId: door.id, part: 'primary', band: DOOR_BAND })
    expect(aim?.outline).toEqual(frameCorners(UPPER_FLOOR_MM, UPPER_FLOOR_MM + 2032))
  })

  it('outlines the upper sash on a level look', () => {
    const aim = aimAt(facingWall, hungWindow)

    expect(aim?.hit).toEqual({ openingId: hungWindow.id, part: 'upper', band: UPPER_SASH_BAND })
    expect(aim?.outline).toEqual(frameCorners(1530, 2100))
  })

  it('outlines the lower sash on a look below the rail', () => {
    const lookingDown: WalkState = { ...facingWall, pitch: -0.3 }

    const aim = aimAt(lookingDown, hungWindow)

    expect(aim?.hit).toEqual({ openingId: hungWindow.id, part: 'lower', band: LOWER_SASH_BAND })
    expect(aim?.outline).toEqual(frameCorners(900, 1530))
  })

  it('keeps the outline on the frame of an open door', () => {
    const aim = aimAt(facingWall, door, { openness: new Map([[door.id, { primary: 1 }]]) })

    expect(aim?.outline).toEqual(frameCorners(0, 2032))
  })

  it('aims at nothing when the walker looks away', () => {
    const lookingAway: WalkState = { ...facingWall, yaw: Math.PI }

    expect(aimAt(lookingAway, door)).toBeNull()
  })

  it('aims at nothing beyond reach', () => {
    const farAway: WalkState = { ...facingWall, position: { ...facingWall.position, z: 0 } }

    expect(aimAt(farAway, door)).toBeNull()
  })
})
