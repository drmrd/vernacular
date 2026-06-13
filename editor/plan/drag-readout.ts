import type { Point, UnitPreferences } from '../../core'
import { formatReadout, segmentReadout } from './draw-readout'

export interface DragReadout {
  anchor: Point
  text: string
}

/** The live drag's readout: the chip text for the segment, anchored at the drag's live point. */
export function dragReadout(from: Point, to: Point, preferences: UnitPreferences): DragReadout {
  return { anchor: to, text: formatReadout(segmentReadout({ start: from, end: to }), preferences) }
}
