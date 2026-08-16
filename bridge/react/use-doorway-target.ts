import { useMemo } from 'react'

import { openingKindOfType, type OpeningSceneNode } from '../../core'

/**
 * The door the doorway camera preset frames, with what to call it in the interface.
 *
 * `name` and `selected` are what the nav toolbar reads, through its own `DoorwayChoice`
 * (scene-nav-toolbar.tsx) rather than an import of this type, so the two have to keep
 * agreeing on what those two fields mean.
 */
export interface DoorwayTarget {
  opening: OpeningSceneNode
  /** The door's element type humanized for display, e.g. 'single swing door'. */
  name: string
  /** True when the user's own selection picked this door. */
  selected: boolean
}

/** An element type id as display text: 'single-swing-door' reads 'single swing door'. */
function humanizeType(typeId: string): string {
  return typeId.replace(/-/g, ' ')
}

function isDoor(opening: OpeningSceneNode): boolean {
  return openingKindOfType(opening.type) === 'door'
}

/**
 * The door the doorway preset frames: the one the user selected when that selection is a
 * door, and otherwise the first door in view order. Windows are excluded outright, a
 * selected one included. The preset stands the camera in the opening and looks inward,
 * which only reads as a doorway for a door, and the whole-building view stacks every floor
 * into one opening list, so taking the first opening unfiltered could plant the camera in
 * an upstairs window. A view with no door returns null, which is what disables the control.
 */
export function chooseDoorwayTarget(
  openings: readonly OpeningSceneNode[],
  selectedIds: ReadonlySet<string>,
): DoorwayTarget | null {
  const doors = openings.filter(isDoor)
  const selectedDoor = doors.find((door) => selectedIds.has(door.id))
  const opening = selectedDoor ?? doors[0]
  if (opening === undefined) return null
  return { opening, name: humanizeType(opening.type), selected: selectedDoor !== undefined }
}

/**
 * `chooseDoorwayTarget` memoized for the live view, so the doorway preset re-resolves as
 * the plan is edited or the selection moves, and not on every unrelated render.
 */
export function useDoorwayTarget(
  openings: readonly OpeningSceneNode[],
  selectedIds: ReadonlySet<string>,
): DoorwayTarget | null {
  return useMemo(() => chooseDoorwayTarget(openings, selectedIds), [openings, selectedIds])
}
