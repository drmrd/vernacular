import { SNAP_KIND_LABELS } from '../commands/snap-commands'
import type { ToolId } from '../tools/active-tool-context'
import type { OverlayEntity } from './overlay-entities'
import type { SnapResult } from './snap'

// The readouts name a snap through the same label map the snapping panel and the
// snap commands read, so the plan never calls a source by an id the panel does not
// use ("trace" against the panel's "Underlay corners").
function snapLabel(snap: SnapResult): string {
  return SNAP_KIND_LABELS[snap.kind]
}

// Sentence case for the visible pill, matching how the snapping panel presents the
// same label beside its checkbox.
function sentenceCase(text: string): string {
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

/** Why a pointer placement put nothing on the plan. */
export type PlacementRefusal = 'no-host-wall' | 'opening-overlap' | 'no-floor-above'

/**
 * Plain text for a refused placement, naming the cause rather than the rule, so
 * the two ways an opening can be refused do not read alike and the stair refusal
 * names the floor that would fix it. Shown on the canvas and announced.
 */
export function placementRefusalMessage(refusal: PlacementRefusal): string {
  switch (refusal) {
    case 'no-host-wall':
      return 'No wall here to host the opening'
    case 'opening-overlap':
      return 'That would overlap an opening already in this wall'
    case 'no-floor-above':
      return 'Add a floor above to place stairs'
  }
}

// The tool a refusal can only have come from: the stair tool raises the missing
// floor above, and both opening causes come from the opening tool.
function refusingTool(refusal: PlacementRefusal): ToolId {
  return refusal === 'no-floor-above' ? 'place-stair' : 'place-opening'
}

/**
 * Why the last placement click put nothing on the plan, while the tool that raised
 * it is still in hand. Empty when nothing has been refused, or when the refusal
 * belongs to another tool: a stair refusal has nothing to say under the opening
 * tool.
 */
export function refusalText(tool: ToolId, refusal: PlacementRefusal | null): string {
  return refusal !== null && refusingTool(refusal) === tool ? placementRefusalMessage(refusal) : ''
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
  return `Snap: ${sentenceCase(snapLabel(snap))}`
}
