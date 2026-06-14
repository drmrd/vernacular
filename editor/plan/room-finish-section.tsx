import { useState } from 'react'
import type { Color, Command, SurfaceRef, SurfaceTreatment } from '../../core'
import { ColorPicker } from '../paint/color-picker'
import { FinishPicker } from '../paint/finish-picker'
import './finish-section.css'

const DEFAULT_FINISH_ID = 'matte'

interface RoomFinishSectionProps {
  floorId: string
  treatmentFor: (ref: SurfaceRef) => SurfaceTreatment | undefined
  recent: Color[]
  dispatch: (command: Command) => void
}

// Floor and ceiling are floor-level surfaces in the model, so all rooms on a floor
// share them; selecting a room is the natural place to reach the floor it sits on.
function surfaceRef(kind: 'floor' | 'ceiling', floorId: string): SurfaceRef {
  return kind === 'floor' ? { kind: 'floor', floorId } : { kind: 'ceiling', floorId }
}

const SURFACES = [
  { kind: 'floor', label: 'Floor' },
  { kind: 'ceiling', label: 'Ceiling' },
] as const

export function RoomFinishSection({
  floorId,
  treatmentFor,
  recent,
  dispatch,
}: RoomFinishSectionProps) {
  const [kind, setKind] = useState<'floor' | 'ceiling'>('floor')
  const ref = surfaceRef(kind, floorId)
  const treatment = treatmentFor(ref)
  const finishId = treatment?.kind === 'solid' ? treatment.finishId : DEFAULT_FINISH_ID
  return (
    <section className="finish-section">
      <h3 className="finish-section__label">Finish</h3>
      <div className="finish-section__faces" role="group" aria-label="Room surface">
        {SURFACES.map((surface) => (
          <button
            key={surface.kind}
            type="button"
            className={`finish-section__chip${kind === surface.kind ? ' finish-section__chip--active' : ''}`}
            aria-pressed={kind === surface.kind}
            onClick={() => setKind(surface.kind)}
          >
            {surface.label}
          </button>
        ))}
      </div>
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
