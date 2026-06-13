import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setRoomSubPurpose, type Command, type SetRoomSubPurposeParams } from '../../core'
import { RoomSubPurposeEditor } from './room-sub-purpose-editor'

// A single selected room, fixed so the displayed value and the dispatched
// command payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_SUB_PURPOSE = 'Silver Pantry'
const ENTERED_SUB_PURPOSE = 'Cold Pantry'

function renderEditor(subPurpose: string | undefined, dispatch: (command: unknown) => void) {
  render(<RoomSubPurposeEditor roomKey={ROOM_KEY} subPurpose={subPurpose} dispatch={dispatch} />)
}

function lastCommand(dispatch: ReturnType<typeof vi.fn>): Command<SetRoomSubPurposeParams> {
  return dispatch.mock.calls[0]?.[0] as Command<SetRoomSubPurposeParams>
}

afterEach(cleanup)

describe('RoomSubPurposeEditor', () => {
  it('shows the seeded sub-purpose in a labeled input', () => {
    renderEditor(SEEDED_SUB_PURPOSE, vi.fn())

    expect(screen.getByLabelText('Sub-purpose')).toHaveValue(SEEDED_SUB_PURPOSE)
  })

  it('dispatches one setRoomSubPurpose for the room when a value is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_SUB_PURPOSE, dispatch)

    const input = screen.getByLabelText('Sub-purpose')
    await user.clear(input)
    await user.type(input, `${ENTERED_SUB_PURPOSE}{Enter}`)

    const expected = setRoomSubPurpose(ROOM_KEY, ENTERED_SUB_PURPOSE)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('dispatches setRoomSubPurpose with undefined when an empty value is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_SUB_PURPOSE, dispatch)

    const input = screen.getByLabelText('Sub-purpose')
    await user.clear(input)
    await user.type(input, '{Enter}')

    const expected = setRoomSubPurpose(ROOM_KEY, undefined)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })
})
