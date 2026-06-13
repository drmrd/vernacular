import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setRoomPeriod, type Command, type SetRoomPeriodParams } from '../../core'
import { RoomPeriodEditor } from './room-period-editor'

// A single tagged room, fixed so the displayed value and any dispatched command
// payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_PERIOD = 'victorian'
const CHOSEN_PERIOD = 'edwardian'

function renderEditor(
  period: 'victorian' | 'edwardian' | undefined,
  dispatch: (command: unknown) => void,
) {
  render(<RoomPeriodEditor roomKey={ROOM_KEY} period={period} dispatch={dispatch} />)
}

function lastCommand(dispatch: ReturnType<typeof vi.fn>): Command<SetRoomPeriodParams> {
  return dispatch.mock.calls[0]?.[0] as Command<SetRoomPeriodParams>
}

afterEach(cleanup)

describe('RoomPeriodEditor', () => {
  it('shows the seeded period as the selected value of a labeled period select', () => {
    renderEditor(SEEDED_PERIOD, vi.fn())

    expect(screen.getByLabelText('Period')).toHaveValue(SEEDED_PERIOD)
  })

  it('offers a leading Inherit option and a named option per builtin period', () => {
    renderEditor(SEEDED_PERIOD, vi.fn())

    const select = screen.getByLabelText('Period')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Inherit')
    expect(options[0]).toHaveValue('')
    expect(select).toContainElement(screen.getByRole('option', { name: 'Victorian' }))
    expect(select).toContainElement(screen.getByRole('option', { name: 'Edwardian' }))
  })

  it('dispatches setRoomPeriod with the chosen registry id when a period is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_PERIOD, dispatch)

    await user.selectOptions(screen.getByLabelText('Period'), CHOSEN_PERIOD)

    const expected = setRoomPeriod(ROOM_KEY, CHOSEN_PERIOD)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('dispatches setRoomPeriod with undefined when the Inherit option is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_PERIOD, dispatch)

    await user.selectOptions(screen.getByLabelText('Period'), '')

    const expected = setRoomPeriod(ROOM_KEY, undefined)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })
})
