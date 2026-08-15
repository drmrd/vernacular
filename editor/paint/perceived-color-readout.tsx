import {
  describePerceivedShift,
  perceivedShiftLabel,
  readableTextColor,
  surfaceKey,
  type Color,
  type SurfaceRef,
} from '../../core'
import { usePerceivedColorSample } from '../../bridge'
import { SectionLabel } from '../design-system'
import './perceived-color-readout.css'

export interface PerceivedColorReadoutProps {
  surface: SurfaceRef
  reference?: Color
}

// Candidate label colors for the swatch chip, matching ColorChip in
// color-picker.tsx so the readout's chip reads the same as the picker's.
const SWATCH_LABEL_LIGHT = '#fbf7ef' // vellum-50
const SWATCH_LABEL_DARK = '#2f2615' // umber-900

export function PerceivedColorReadout({ surface, reference }: PerceivedColorReadoutProps) {
  const sample = usePerceivedColorSample()
  // The readout is an optional enhancement, and rendering nothing until a
  // sample exists is what keeps the finish sections unchanged in isolated
  // Storybook stories, so the committed story baselines do not move.
  if (sample === null) {
    return null
  }
  // A stale sample from a previously picked surface must never be
  // captioned with this surface's paint.
  if (surfaceKey(sample.surface) !== surfaceKey(surface)) {
    return null
  }
  const labelColor = readableTextColor(sample.color.srgbHex, {
    light: SWATCH_LABEL_LIGHT,
    dark: SWATCH_LABEL_DARK,
  })
  return (
    <section className="perceived-readout">
      <SectionLabel>Under this light</SectionLabel>
      <span
        className="perceived-readout__chip"
        data-perceived={sample.color.srgbHex}
        style={{ background: sample.color.srgbHex, color: labelColor }}
      >
        {sample.color.srgbHex}
      </span>
      {reference !== undefined && (
        <p className="perceived-readout__shift">
          {perceivedShiftLabel(describePerceivedShift(sample.color, reference))}
        </p>
      )}
    </section>
  )
}
