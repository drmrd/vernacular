import type { SceneGraph } from '../../core'
import type { Bounds } from './fit'
import { entitiesCrossingRect, entitiesInRect } from './marquee'
import type { MarqueeMode, SelectOperation } from './select-gesture'

export interface MarqueeResolution {
  rect: Bounds
  mode: MarqueeMode
  operation: SelectOperation
}

function entitiesForMode(
  scene: SceneGraph,
  marquee: Pick<MarqueeResolution, 'rect' | 'mode'>,
  options: { dimensionsVisible?: boolean },
): string[] {
  return marquee.mode === 'crossing'
    ? entitiesCrossingRect(scene, marquee.rect, options)
    : entitiesInRect(scene, marquee.rect, options)
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
 * and Shift+Alt together add. Modifiers held at release play no part. When
 * `options.dimensionsVisible` is `false`, every dimension is excluded from the
 * picked entities, matching what is visible.
 */
// eslint-disable-next-line max-params -- options carries the overlay-visibility flag, mirroring hitTest and planClickTarget; folding it into scene/current/marquee would blur the fold-then-filter contract
export function resolveMarqueeSelection(
  scene: SceneGraph,
  current: ReadonlySet<string>,
  marquee: MarqueeResolution,
  options: { dimensionsVisible?: boolean } = {},
): string[] {
  return fold(current, entitiesForMode(scene, marquee, options), marquee.operation)
}
