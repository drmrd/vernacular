import { distance, formatAdaptiveLength, type UnitPreferences } from '../../core'
import { DEGREES_PER_TURN, RAD_TO_DEG } from './angles'
import type { PreviewSegment } from './draw-plan'

export interface DrawReadout {
  lengthMm: number
  bearingDeg: number
}

/** The in-progress segment's length in millimeters and its bearing in [0, 360) degrees. */
export function segmentReadout(segment: PreviewSegment): DrawReadout {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const raw = Math.atan2(dy, dx) * RAD_TO_DEG
  // raw is already within one turn ([-180, 180]); + DEGREES_PER_TURN keeps
  // JavaScript's sign-preserving % from yielding a negative bearing.
  const bearingDeg = (raw + DEGREES_PER_TURN) % DEGREES_PER_TURN
  return { lengthMm: distance(segment.start, segment.end), bearingDeg }
}

/** The chip text: the adaptive length and the rounded bearing, e.g. "2.40 m 45°". */
export function formatReadout(readout: DrawReadout, preferences: UnitPreferences): string {
  return `${formatAdaptiveLength(readout.lengthMm, preferences)} ${Math.round(readout.bearingDeg)}°`
}
