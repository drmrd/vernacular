import { SectionLabel } from '../design-system'
import './overall-dimensions.css'

interface OverallDimensionsProps {
  extent: { width: string; height: string } | null
}

// The rail's title-block dimension note: the drawn plan's overall width and height,
// already formatted in the project's units. It states a measurement rather than
// labeling a control, so the value reads in the monospace dimension face. Renders
// nothing on an empty plan so a blank project stays uncluttered.
export function OverallDimensions({ extent }: OverallDimensionsProps) {
  if (extent === null) {
    return null
  }
  return (
    <div className="overall-dimensions">
      <SectionLabel>Overall</SectionLabel>
      <span className="overall-dimensions__value">{`${extent.width} × ${extent.height}`}</span>
    </div>
  )
}
