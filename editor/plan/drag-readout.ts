import { formatAdaptiveLength, type Point, type UnitPreferences } from '../../core'
import { formatReadout, segmentReadout } from './draw-readout'

export interface DragReadout {
  anchor: Point
  text: string
}

/** The live drag's readout: the chip text for the segment, anchored at the drag's live point. */
export function dragReadout(from: Point, to: Point, preferences: UnitPreferences): DragReadout {
  return { anchor: to, text: formatReadout(segmentReadout({ start: from, end: to }), preferences) }
}

/** The live drag's readout showing only a length, anchored at the drag's live point. */
export function lengthReadout(
  anchor: Point,
  lengthMm: number,
  preferences: UnitPreferences,
): DragReadout {
  return { anchor, text: formatAdaptiveLength(lengthMm, preferences) }
}
