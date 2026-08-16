import { useState } from 'react'
import type { Color, Command, SurfaceRef, SurfaceTreatment } from '../../core'
import { SectionLabel, Segmented } from '../design-system'
import { ColorPicker } from '../paint/color-picker'
import { FinishPicker, FloorPatternPicker } from '../paint/finish-picker'
import { PerceivedColorReadout } from '../paint/perceived-color-readout'
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

type SolidPaint = Extract<SurfaceTreatment, { kind: 'solid' }>

// The solid paint on a surface, or undefined when the surface is unpainted or
// carries a pattern. Narrowing once here spares the section body from re-testing
// the treatment kind for each thing it draws from that paint: the picker's finish,
// the readout's reference color, and the finish picker itself.
function solidPaint(treatment: SurfaceTreatment | undefined): SolidPaint | undefined {
  return treatment?.kind === 'solid' ? treatment : undefined
}

interface RoomSurfaceSwitchProps {
  kind: 'floor' | 'ceiling'
  onSelect: (kind: 'floor' | 'ceiling') => void
}

// The floor/ceiling switch. It owns the narrowing from Segmented's string option
// value back to a surface kind, so the section body deals only in kinds.
function RoomSurfaceSwitch({ kind, onSelect }: RoomSurfaceSwitchProps) {
  return (
    <Segmented
      label="Room surface"
      options={SURFACE_OPTIONS}
      value={kind}
      onSelect={(value) => {
        if (isSurfaceKind(value)) onSelect(value)
      }}
    />
  )
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
  const solid = solidPaint(treatment)
  const patternId = treatment?.kind === 'pattern' ? treatment.patternId : undefined
  return (
    <section className="finish-section">
      <SectionLabel>Finish</SectionLabel>
      <RoomSurfaceSwitch kind={kind} onSelect={setKind} />
      <ColorPicker
        surface={ref}
        finishId={solid?.finishId ?? DEFAULT_FINISH_ID}
        recent={recent}
        dispatch={dispatch}
      />
      <PerceivedColorReadout surface={ref} reference={solid?.color} />
      {solid !== undefined ? (
        <FinishPicker
          surface={ref}
          color={solid.color}
          finishId={solid.finishId}
          dispatch={dispatch}
        />
      ) : null}
      {kind === 'floor' ? (
        <FloorPatternPicker surface={ref} patternId={patternId} dispatch={dispatch} />
      ) : null}
    </section>
  )
}
