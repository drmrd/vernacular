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
        <Button
          variant="neutral"
          onClick={() => dispatch(flipOpening(floorId, opening.id, 'hinge'))}
        >
          Flip hinge
        </Button>
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
