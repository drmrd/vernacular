import { OPENING_NODE_PREFIX } from './scene-graph'
import type { Entrance } from './front-direction'

/** How a door relates to the main entrance: marked by the owner, guessed by Vernacular, or neither. */
export type EntranceRole = 'marked' | 'guessed' | 'other'

/** Classify a door as the owner-marked, guessed, or other entrance. */
export function entranceRoleOf(
  entrance: Entrance,
  floorId: string,
  openingId: string,
): EntranceRole {
  const door = entrance.door
  if (door?.floorId !== floorId || door.id !== `${OPENING_NODE_PREFIX}${openingId}`) {
    return 'other'
  }
  return entrance.source === 'marked' ? 'marked' : 'guessed'
}
