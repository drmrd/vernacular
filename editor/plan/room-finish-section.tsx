import { useState } from 'react'
import type { Color, Command, SurfaceRef, SurfaceTreatment } from '../../core'
import { Segmented } from '../design-system'
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
  return { kind, floorId }
}

const SURFACES = [
  { kind: 'floor', label: 'Floor' },
  { kind: 'ceiling', label: 'Ceiling' },
] as const

const SURFACE_OPTIONS = SURFACES.map((surface) => ({
  value: surface.kind,
  label: surface.label,
}))
const SURFACE_KINDS = SURFACES.map((surface) => surface.kind)

function isSurfaceKind(value: string): value is 'floor' | 'ceiling' {
  return (SURFACE_KINDS as readonly string[]).includes(value)
}

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
      <Segmented
        label="Room surface"
        options={SURFACE_OPTIONS}
        value={kind}
        onSelect={(value) => {
          if (isSurfaceKind(value)) setKind(value)
        }}
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
