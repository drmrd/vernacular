import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setRoomName, type Command, type SetRoomNameParams } from '../../core'
import { RoomNameEditor } from './room-name-editor'

// A single selected room, fixed so the displayed value and the dispatched
// command payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const CURRENT_NAME = 'Parlor'
const ENTERED_NAME = 'Front Parlor'

function renderEditor(name: string, dispatch: (command: unknown) => void) {
  render(<RoomNameEditor roomKey={ROOM_KEY} name={name} dispatch={dispatch} />)
}

function lastCommand(dispatch: ReturnType<typeof vi.fn>): Command<SetRoomNameParams> {
  return dispatch.mock.calls[0]?.[0] as Command<SetRoomNameParams>
}

afterEach(cleanup)

describe('RoomNameEditor', () => {
  it('shows the current effective room name in a labeled input', () => {
    renderEditor(CURRENT_NAME, vi.fn())

    expect(screen.getByLabelText(/name/i)).toHaveValue(CURRENT_NAME)
  })

  it('dispatches one setRoomName for the room when a name is committed with Enter', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(CURRENT_NAME, dispatch)

    const input = screen.getByLabelText(/name/i)
    await user.clear(input)
    await user.type(input, `${ENTERED_NAME}{Enter}`)

    const expected = setRoomName(ROOM_KEY, ENTERED_NAME)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('dispatches setRoomName with an empty name when the input is cleared and committed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(CURRENT_NAME, dispatch)

    const input = screen.getByLabelText(/name/i)
    await user.clear(input)
    await user.type(input, '{Enter}')

    const expected = setRoomName(ROOM_KEY, '')
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('renders the name input through the styled design-system field wrapper', () => {
    renderEditor(CURRENT_NAME, vi.fn())

    const input = screen.getByLabelText(/name/i)
    expect(input.closest('.ds-field')).not.toBeNull()
  })
})
