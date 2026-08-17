import { SNAP_KIND_LABELS } from '../commands/snap-commands'
import type { OverlayEntity } from './overlay-entities'
import type { SnapResult } from './snap'

// The readouts name a snap through the same label map the snapping panel and the
// snap commands read, so the plan never calls a source by an id the panel does not
// use ("trace" against the panel's "Underlay corners").
function snapLabel(snap: SnapResult): string {
  return SNAP_KIND_LABELS[snap.kind]
}

// Sentence case for the visible pill, matching how the panel presents the same
// label beside its checkbox.
function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

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
  return `Snapped to ${snapLabel(snap)}`
}

/** Screen-reader text naming the angle the drawn wall is locked to. */
export function angleLockAnnouncement(bearingDeg: number): string {
  return `Locked to ${Math.round(bearingDeg)} degrees`
}

/** Visible status text naming the engaged snap kind, or empty when none is active. */
export function snapStatusLabel(snap: SnapResult | null): string {
  if (snap === null) {
    return ''
  }
  return `Snap: ${titleCase(snapLabel(snap))}`
}
