import type { OverlayEntity } from './overlay-entities'
import type { SnapResult } from './snap'

/** Screen-reader text describing the current selection state. */
export function selectionAnnouncement(selected: readonly OverlayEntity[]): string {
  if (selected.length === 0) {
    return 'Selection cleared'
  }
  const [only] = selected
  if (selected.length === 1 && only !== undefined) {
    return `Selected ${only.label}`
  }
  return `${selected.length} items selected`
}

/** Screen-reader text describing the active snap, or empty when none is active. */
export function snapAnnouncement(snap: SnapResult | null): string {
  if (snap === null) {
    return ''
  }
  return `Snapped to ${snap.kind}`
}
