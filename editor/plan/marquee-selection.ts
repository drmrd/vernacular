import type { SceneGraph } from '../../core'
import type { Bounds } from './fit'
import { entitiesCrossingRect, entitiesInRect } from './marquee'
import type { MarqueeMode, SelectOperation } from './select-gesture'

export interface MarqueeResolution {
  rect: Bounds
  mode: MarqueeMode
  operation: SelectOperation
}

function entitiesForMode(scene: SceneGraph, rect: Bounds, mode: MarqueeMode): string[] {
  return mode === 'crossing' ? entitiesCrossingRect(scene, rect) : entitiesInRect(scene, rect)
}

function fold(
  current: ReadonlySet<string>,
  hits: readonly string[],
  operation: SelectOperation,
): string[] {
  if (operation === 'replace') return [...hits]
  if (operation === 'add') return [...new Set([...current, ...hits])]
  const removed = new Set(hits)
  return [...current].filter((id) => !removed.has(id))
}

/**
 * The next selection after a marquee release: the entities the rectangle picks
 * under its `mode`, folded into `current` by its `operation`. The operation is
 * locked in at the pending-to-marquee transition, from the modifiers held on the
 * sample that triggers it: Shift alone replaces the set, Alt alone subtracts,
 * and Shift+Alt together add. Modifiers held at release play no part.
 */
export function resolveMarqueeSelection(
  scene: SceneGraph,
  current: ReadonlySet<string>,
  marquee: MarqueeResolution,
): string[] {
  return fold(current, entitiesForMode(scene, marquee.rect, marquee.mode), marquee.operation)
}
