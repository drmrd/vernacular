import { useState } from 'react'
import type { Color, Command, SurfaceRef, SurfaceTreatment } from '../../core'
import { Segmented } from '../design-system'
import { ColorPicker } from '../paint/color-picker'
import { FinishPicker } from '../paint/finish-picker'
import './finish-section.css'

// The finish handed to ColorPicker before the user has chosen one, matching the
// paint panel's default: a new solid treatment starts matte.
const DEFAULT_FINISH_ID = 'matte'

interface WallFinishSectionProps {
  wallId: string
  treatmentFor: (ref: SurfaceRef) => SurfaceTreatment | undefined
  recent: Color[]
  dispatch: (command: Command) => void
}

// A wall has two paintable faces; the inspector labels them A and B rather than the
// model's left/right so the chips read as plan annotations, not implementation detail.
const FACES = [
  { side: 'left', label: 'A' },
  { side: 'right', label: 'B' },
] as const

export function WallFinishSection({
  wallId,
  treatmentFor,
  recent,
  dispatch,
}: WallFinishSectionProps) {
  const [side, setSide] = useState<'left' | 'right'>('left')
  const ref: SurfaceRef = { kind: 'wall-face', wallId, side }
  const treatment = treatmentFor(ref)
  const finishId = treatment?.kind === 'solid' ? treatment.finishId : DEFAULT_FINISH_ID
  return (
    <section className="finish-section">
      <h3 className="finish-section__label">Finish</h3>
      <Segmented
        label="Wall face"
        options={FACES.map((face) => ({ value: face.side, label: face.label }))}
        value={side}
        onSelect={(value) => setSide(value as 'left' | 'right')}
      />
      <ColorPicker surface={ref} finishId={finishId} recent={recent} dispatch={dispatch} />
      {treatment?.kind === 'solid' ? (
        <FinishPicker
          surface={ref}
          color={treatment.color}
          finishId={treatment.finishId}
          dispatch={dispatch}
        />
      ) : null}
    </section>
  )
}
