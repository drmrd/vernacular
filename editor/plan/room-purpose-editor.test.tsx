import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setRoomPurpose, type Command, type SetRoomPurposeParams } from '../../core'
import { RoomPurposeEditor } from './room-purpose-editor'

// A single tagged room, fixed so the displayed value and any dispatched command
// payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_PURPOSE = 'parlor'
const CHOSEN_PURPOSE = 'kitchen'

function renderEditor(
  purpose: 'parlor' | 'kitchen' | undefined,
  dispatch: (command: unknown) => void,
) {
  render(<RoomPurposeEditor roomKey={ROOM_KEY} purpose={purpose} dispatch={dispatch} />)
}

function lastCommand(dispatch: ReturnType<typeof vi.fn>): Command<SetRoomPurposeParams> {
  return dispatch.mock.calls[0]?.[0] as Command<SetRoomPurposeParams>
}

afterEach(cleanup)

describe('RoomPurposeEditor', () => {
  it('shows the seeded purpose as the selected value of a labeled purpose select', () => {
    renderEditor(SEEDED_PURPOSE, vi.fn())

    expect(screen.getByLabelText('Purpose')).toHaveValue(SEEDED_PURPOSE)
  })

  it('offers a leading Untagged option and a named option per builtin purpose', () => {
    renderEditor(SEEDED_PURPOSE, vi.fn())

    const select = screen.getByLabelText('Purpose')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Untagged')
    expect(options[0]).toHaveValue('')
    expect(select).toContainElement(screen.getByRole('option', { name: 'Parlor' }))
  })

  it('dispatches setRoomPurpose with the chosen registry id when a purpose is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_PURPOSE, dispatch)

    await user.selectOptions(screen.getByLabelText('Purpose'), CHOSEN_PURPOSE)

    const expected = setRoomPurpose(ROOM_KEY, CHOSEN_PURPOSE)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('dispatches setRoomPurpose with undefined when the Untagged option is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_PURPOSE, dispatch)

    await user.selectOptions(screen.getByLabelText('Purpose'), '')

    const expected = setRoomPurpose(ROOM_KEY, undefined)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })
})
