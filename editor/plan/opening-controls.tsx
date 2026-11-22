import { useId, type ReactElement } from 'react'
import { ReasonDescription } from '../../bridge'
import {
  builtinElementTypes,
  flipOpening,
  getEntry,
  removeOpening,
  type Command,
  type Opening,
} from '../../core'
import { Button, Stack } from '../design-system'
import { RemoveControl } from './remove-control'

const ROOM_SIDE_SETS_SASHES_REASON = 'The room side sets which way the sashes face on this wall.'

interface FacingControl {
  label: string
  disabledReason: string | undefined
}

/**
 * The facing button of an opening: a hung window swaps its sash sides, anything else flips its
 * swing. A hung window on a wall with one room side has no free choice, since that side sets the
 * sashes, so the button carries the reason it is unavailable.
 */
function facingControl(typeId: string, wallHasOneRoomSide: boolean): FacingControl {
  const family = getEntry(builtinElementTypes, typeId)?.opening?.family
  if (family !== 'window-hung') {
    return { label: 'Flip swing', disabledReason: undefined }
  }
  return {
    label: 'Swap sash sides',
    disabledReason: wallHasOneRoomSide ? ROOM_SIDE_SETS_SASHES_REASON : undefined,
  }
}

const NO_HINGE_SIDE_REASON = 'This kind of opening has no hinge side to choose.'

const HINGED_FAMILIES: ReadonlySet<string> = new Set(['swing', 'fold', 'pivot'])

/**
 * The hinge side only shows on swing, fold, and pivot openings and on a casement window; every
 * other kind draws and moves the same either way, so the button says why it is unavailable.
 */
function hingeDisabledReason(typeId: string): string | undefined {
  const opening = getEntry(builtinElementTypes, typeId)?.opening
  if (opening === undefined) return NO_HINGE_SIDE_REASON
  const isCasement = opening.family === 'window-crank' && opening.hingeEdge === 'jamb'
  return HINGED_FAMILIES.has(opening.family) || isCasement ? undefined : NO_HINGE_SIDE_REASON
}

function FlipHingeButton({
  opening,
  floorId,
  dispatch,
}: Omit<OpeningControlsProps, 'wallHasOneRoomSide'>): ReactElement {
  const reasonId = useId()
  const disabledReason = hingeDisabledReason(opening.type)
  const unavailable = disabledReason !== undefined
  return (
    <>
      <Button
        variant="neutral"
        aria-disabled={unavailable ? true : undefined}
        aria-describedby={unavailable ? reasonId : undefined}
        title={disabledReason}
        onClick={() => {
          if (unavailable) return
          dispatch(flipOpening(floorId, opening.id, 'hinge'))
        }}
      >
        Flip hinge
      </Button>
      <ReasonDescription id={reasonId} reason={disabledReason} />
    </>
  )
}

interface OpeningControlsProps {
  opening: Opening
  floorId: string
  wallHasOneRoomSide: boolean
  dispatch: (command: Command) => void
}

export function OpeningControls({
  opening,
  floorId,
  wallHasOneRoomSide,
  dispatch,
}: OpeningControlsProps): ReactElement {
  const reasonId = useId()
  const { label, disabledReason } = facingControl(opening.type, wallHasOneRoomSide)
  const unavailable = disabledReason !== undefined
  return (
    <Stack direction="horizontal" gap="space-3">
      <Stack direction="horizontal" gap="space-2">
        <FlipHingeButton opening={opening} floorId={floorId} dispatch={dispatch} />
        <Button
          variant="neutral"
          aria-disabled={unavailable ? true : undefined}
          aria-describedby={unavailable ? reasonId : undefined}
          title={disabledReason}
          onClick={() => {
            if (unavailable) return
            dispatch(flipOpening(floorId, opening.id, 'facing'))
          }}
        >
          {label}
        </Button>
        <ReasonDescription id={reasonId} reason={disabledReason} />
      </Stack>
      <RemoveControl
        targetId={opening.id}
        onConfirm={() => dispatch(removeOpening(floorId, opening.id))}
      />
    </Stack>
  )
}
