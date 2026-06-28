import type { ReactElement } from 'react'
import { compassNeedleRotationDegrees } from './compass-rotation'

// The compass viewBox is 24 x 36 user units, so the needle pivots about its center.
const COMPASS_CENTER_X = 12
const COMPASS_CENTER_Y = 18

export interface CompassProps {
  // The site's north bearing in radians (the angle from plan-up to true north). When
  // absent or zero the needle points straight up, north as the plan is drawn.
  northBearing?: number | undefined
}

// The transform that swings the needle group to true north, or undefined when the
// bearing leaves north pointing up so the default mark renders unrotated.
function needleTransform(northBearing: number): string | undefined {
  const rotation = compassNeedleRotationDegrees(northBearing)
  if (rotation === 0) {
    return undefined
  }
  return `rotate(${rotation} ${COMPASS_CENTER_X} ${COMPASS_CENTER_Y})`
}

// The brass north compass pinned to the plan's upper-right: an "N" above a needle
// whose filled half points north. The plan view never rotates, so the needle group
// rotates by the site's north bearing to keep the mark aimed at true north; its
// color flows from the accent token through currentColor.
export function Compass({ northBearing = 0 }: CompassProps): ReactElement {
  return (
    <svg
      className="plan-overlay__compass"
      width="22"
      height="33"
      viewBox="0 0 24 36"
      role="img"
      aria-label="North"
    >
      <g transform={needleTransform(northBearing)}>
        <text className="plan-overlay__compass-label" x="12" y="9" textAnchor="middle">
          N
        </text>
        <polygon points="12,11 9,23 15,23" fill="currentColor" />
        <polygon points="12,33 9,23 15,23" fill="none" stroke="currentColor" strokeWidth={1} />
      </g>
    </svg>
  )
}
