import { describe, it, expect } from 'vitest'
import type { OpeningSceneNode } from '../../core'
import { chooseDoorwayTarget } from './use-doorway-target'

// Plausible constants shared by every fixture opening. The geometry itself is
// irrelevant to the target-selection rules under test; only `id`, `type`, and
// `floorId` vary between fixtures.
const CENTER = { x: 0, y: 0 }
const ALONG = { x: 1, y: 0 }
const NORMAL = { x: 0, y: 1 }
const WIDTH = 900
const HEIGHT = 2032
const SILL_HEIGHT = 0
const HOST_THICKNESS = 140
const ORIENTATION = { hinge: 'start', facing: 'positive' } as const

function opening(id: string, type: string, floorId = 'floor:ground'): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId,
    type,
    center: CENTER,
    along: ALONG,
    normal: NORMAL,
    width: WIDTH,
    height: HEIGHT,
    sillHeight: SILL_HEIGHT,
    hostThickness: HOST_THICKNESS,
    orientation: ORIENTATION,
  }
}

const NO_SELECTION: ReadonlySet<string> = new Set()

describe('chooseDoorwayTarget', () => {
  it('returns null when the opening list holds no door, whether empty or windows only', () => {
    expect(chooseDoorwayTarget([], NO_SELECTION)).toBeNull()

    const windowsOnly = [
      opening('opening:1', 'double-hung-window'),
      opening('opening:2', 'picture-window'),
    ]
    expect(chooseDoorwayTarget(windowsOnly, NO_SELECTION)).toBeNull()
  })

  it('falls back to the first door in list order, skipping leading windows, when nothing is selected', () => {
    const window = opening('opening:1', 'sliding-window')
    const firstDoor = opening('opening:2', 'french-door')
    const secondDoor = opening('opening:3', 'pocket-door')
    const openings = [window, firstDoor, secondDoor]

    const target = chooseDoorwayTarget(openings, NO_SELECTION)

    expect(target).not.toBeNull()
    expect(target?.opening).toBe(firstDoor)
    expect(target?.selected).toBe(false)
    expect(target?.name).toBe('french door')
  })

  it('prefers a door the user selected over the first door in list order', () => {
    const firstDoor = opening('opening:1', 'single-swing-door')
    const selectedDoor = opening('opening:2', 'bifold-door')
    const openings = [firstDoor, selectedDoor]

    const target = chooseDoorwayTarget(openings, new Set([selectedDoor.id]))

    expect(target).not.toBeNull()
    expect(target?.opening).toBe(selectedDoor)
    expect(target?.selected).toBe(true)
  })

  it('does not let a selected window win: falls back to the first door instead', () => {
    // Whole-building framing spans every floor, so a second-floor window that
    // happens to carry the user's selection must not steer the camera at all.
    const selectedWindow = opening('opening:1', 'transom-window', 'floor:second')
    const firstDoor = opening('opening:2', 'double-swing-door', 'floor:ground')
    const openings = [selectedWindow, firstDoor]

    const target = chooseDoorwayTarget(openings, new Set([selectedWindow.id]))

    expect(target).not.toBeNull()
    expect(target?.opening).toBe(firstDoor)
    expect(target?.selected).toBe(false)
  })

  it('humanizes a hyphenated element type id into space-separated words for display', () => {
    const door = opening('opening:1', 'cased-opening')

    const target = chooseDoorwayTarget([door], NO_SELECTION)

    expect(target?.name).toBe('cased opening')
  })
})
