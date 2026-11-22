import { useId, type ReactElement } from 'react'
import { ReasonDescription } from '../../bridge'
import {
  builtinElementTypes,
  flipOpening,
  getEntry,
  openingTypeHasHingeSide,
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

/** The hinge button says why it is unavailable on a kind that draws and moves the same either way. */
function hingeDisabledReason(typeId: string): string | undefined {
  return openingTypeHasHingeSide(typeId) ? undefined : NO_HINGE_SIDE_REASON
}

interface UnavailableReasonButtonProps {
  label: string
  unavailableReason: string | undefined
  onActivate: () => void
}

/**
 * A button that stays focusable when it cannot act: `aria-disabled` marks it inert, and the reason
 * is both its hover text and a hidden description that `aria-describedby` points at.
 */
function UnavailableReasonButton({
  label,
  unavailableReason,
  onActivate,
}: UnavailableReasonButtonProps): ReactElement {
  const reasonId = useId()
  const unavailable = unavailableReason !== undefined
  return (
    <>
      <Button
        variant="neutral"
        aria-disabled={unavailable ? true : undefined}
        aria-describedby={unavailable ? reasonId : undefined}
        title={unavailableReason}
        onClick={() => {
          if (unavailable) return
          onActivate()
        }}
      >
        {label}
      </Button>
      <ReasonDescription id={reasonId} reason={unavailableReason} />
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
  const { label, disabledReason } = facingControl(opening.type, wallHasOneRoomSide)
  return (
    <Stack direction="horizontal" gap="space-3">
      <Stack direction="horizontal" gap="space-2">
        <UnavailableReasonButton
          label="Flip hinge"
          unavailableReason={hingeDisabledReason(opening.type)}
          onActivate={() => dispatch(flipOpening(floorId, opening.id, 'hinge'))}
        />
        <UnavailableReasonButton
          label={label}
          unavailableReason={disabledReason}
          onActivate={() => dispatch(flipOpening(floorId, opening.id, 'facing'))}
        />
      </Stack>
      <RemoveControl
        targetId={opening.id}
        onConfirm={() => dispatch(removeOpening(floorId, opening.id))}
      />
    </Stack>
  )
}
