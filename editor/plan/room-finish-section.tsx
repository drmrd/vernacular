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
  // Floor and ceiling finishes are storey-scoped, not room-scoped (see surfaceRef
  // below), so the section needs to know how many rooms share that scope to warn
  // before a "room" edit silently repaints every room on the storey. Defaults to a
  // single room, which is the only count where a room-driven paint is unambiguous.
  roomsOnFloor?: number
}

const SHARED_HINT = 'Floor and ceiling finishes cover the whole storey, not just the selected room.'

// The note borrows the hint's muted styling and adds its own class as the semantic
// hook; the shared stylesheet carries no rule for the note class on its own.
const NOTE_CLASS = 'finish-section__hint finish-section__note'

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
      label="Storey surface"
      options={SURFACE_OPTIONS}
      value={kind}
      onSelect={(value) => {
        if (isSurfaceKind(value)) onSelect(value)
      }}
    />
  )
}

// The whole-storey warning shown in place of the paint controls once a floor
// holds more than one room, since a room-driven edit there has no single room
// to attach to; the room count grounds the warning in what the user is looking at.
function sharedRoomsNote(roomsOnFloor: number): string {
  return (
    `This storey holds ${roomsOnFloor} rooms, so a finish here would repaint every ` +
    'one of them. Per-room floor and ceiling finishes are not available yet.'
  )
}

interface RoomFinishControlsProps {
  surface: SurfaceRef
  kind: 'floor' | 'ceiling'
  onSelectKind: (kind: 'floor' | 'ceiling') => void
  treatment: SurfaceTreatment | undefined
  recent: Color[]
  dispatch: (command: Command) => void
}

// The surface switch and paint controls, only meaningful while the selected
// room is the storey's only room (see RoomFinishSection); split out so that
// case can be rendered without smuggling an unattributable "room" edit past
// the roomsOnFloor guard.
function RoomFinishControls({
  surface,
  kind,
  onSelectKind,
  treatment,
  recent,
  dispatch,
}: RoomFinishControlsProps) {
  const solid = solidPaint(treatment)
  const patternId = treatment?.kind === 'pattern' ? treatment.patternId : undefined
  return (
    <>
      <RoomSurfaceSwitch kind={kind} onSelect={onSelectKind} />
      <ColorPicker
        surface={surface}
        finishId={solid?.finishId ?? DEFAULT_FINISH_ID}
        recent={recent}
        dispatch={dispatch}
      />
      <PerceivedColorReadout surface={surface} reference={solid?.color} />
      {solid !== undefined ? (
        <FinishPicker
          surface={surface}
          color={solid.color}
          finishId={solid.finishId}
          dispatch={dispatch}
        />
      ) : null}
      {kind === 'floor' ? (
        <FloorPatternPicker surface={surface} patternId={patternId} dispatch={dispatch} />
      ) : null}
    </>
  )
}

export function RoomFinishSection({
  floorId,
  treatmentFor,
  recent,
  dispatch,
  roomsOnFloor = 1,
}: RoomFinishSectionProps) {
  const [kind, setKind] = useState<'floor' | 'ceiling'>('floor')
  const ref = surfaceRef(kind, floorId)
  const sharedAcrossRooms = roomsOnFloor > 1
  return (
    <section className="finish-section">
      <SectionLabel>Floor finish (whole storey)</SectionLabel>
      <p className="finish-section__hint">{SHARED_HINT}</p>
      {sharedAcrossRooms ? (
        <p className={NOTE_CLASS}>{sharedRoomsNote(roomsOnFloor)}</p>
      ) : (
        <RoomFinishControls
          surface={ref}
          kind={kind}
          onSelectKind={setKind}
          treatment={treatmentFor(ref)}
          recent={recent}
          dispatch={dispatch}
        />
      )}
    </section>
  )
}
