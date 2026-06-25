import { useState } from 'react'
import type { Color, Command, SurfaceRef, SurfaceTreatment } from '../../core'
import { useHighlightedSurface } from '../../bridge'
import { SectionLabel, Segmented } from '../design-system'
import { useWallFaceHighlight } from './use-wall-face-highlight'
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

const FACE_OPTIONS = FACES.map((face) => ({ value: face.side, label: face.label }))
const FACE_SIDES = FACES.map((face) => face.side)

function isFaceSide(value: string): value is 'left' | 'right' {
  return (FACE_SIDES as readonly string[]).includes(value)
}

/**
 * The face the chips should preview: the plan-highlighted face of this wall when it
 * differs from the selected side, otherwise undefined. The selected face is already
 * shown as active, so only an external highlight on the OTHER face previews a chip,
 * which keeps the reverse link (plan -> chip) from echoing the section's own forward
 * highlight (chip -> plan, which always points at the selected face) back as a preview.
 */
function previewedSide(
  highlighted: SurfaceRef | null,
  wallId: string,
  selectedSide: 'left' | 'right',
): 'left' | 'right' | undefined {
  if (
    highlighted === null ||
    highlighted.kind !== 'wall-face' ||
    highlighted.wallId !== wallId ||
    highlighted.side === selectedSide
  ) {
    return undefined
  }
  return highlighted.side
}

export function WallFinishSection({
  wallId,
  treatmentFor,
  recent,
  dispatch,
}: WallFinishSectionProps) {
  const [side, setSide] = useState<'left' | 'right'>('left')
  const onHoverFace = useWallFaceHighlight(wallId, side)
  const highlighted = useHighlightedSurface()
  const preview = previewedSide(highlighted, wallId, side)
  const ref: SurfaceRef = { kind: 'wall-face', wallId, side }
  const treatment = treatmentFor(ref)
  const finishId = treatment?.kind === 'solid' ? treatment.finishId : DEFAULT_FINISH_ID
  return (
    <section className="finish-section">
      <SectionLabel>Finish</SectionLabel>
      <p className="finish-section__hint">A and B are the wall&apos;s two paintable faces.</p>
      <Segmented
        label="Wall face"
        options={FACE_OPTIONS}
        value={side}
        {...(preview ? { previewValue: preview } : {})}
        onSelect={(value) => {
          if (isFaceSide(value)) setSide(value)
        }}
        onHover={onHoverFace}
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
