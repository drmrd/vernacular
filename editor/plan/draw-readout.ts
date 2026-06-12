import { distance, formatAdaptiveLength, type UnitPreferences } from '../../core'
import type { PreviewSegment } from './draw-plan'

const DEGREES_PER_HALF_TURN = 180
const DEGREES_PER_TURN = 360
const RAD_TO_DEG = DEGREES_PER_HALF_TURN / Math.PI

export interface DrawReadout {
  lengthMm: number
  bearingDeg: number
}

/** The in-progress segment's length in millimeters and its bearing in [0, 360) degrees. */
export function segmentReadout(segment: PreviewSegment): DrawReadout {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const raw = Math.atan2(dy, dx) * RAD_TO_DEG
  const bearingDeg = ((raw % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN
  return { lengthMm: distance(segment.start, segment.end), bearingDeg }
}

/** The chip text: the adaptive length and the rounded bearing, e.g. "2.40 m 45°". */
export function formatReadout(readout: DrawReadout, preferences: UnitPreferences): string {
  return `${formatAdaptiveLength(readout.lengthMm, preferences)} ${Math.round(readout.bearingDeg)}°`
}
