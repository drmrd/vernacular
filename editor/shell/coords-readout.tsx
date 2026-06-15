import type { ReactElement } from 'react'
import { useEditorSession } from '../../bridge'
import { preferencesForUnits } from '../../core'
import { formatCoords } from '../plan/format-coords'
import { usePointerReadout } from '../plan/pointer-readout'

/**
 * The status-bar coordinate readout: the cursor's world position in project units,
 * blank when the pointer is off the canvas. It subscribes to the pointer-readout
 * value alone, so a cursor move repaints this text without touching the canvas.
 */
export function CoordsReadout(): ReactElement | null {
  const world = usePointerReadout()
  const session = useEditorSession()
  if (world === null) {
    return null
  }
  return <>{formatCoords(world, preferencesForUnits(session.getProject().meta.units))}</>
}
