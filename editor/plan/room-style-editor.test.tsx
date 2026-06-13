import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  setRoomStyle,
  builtinStyles,
  type Command,
  type SetRoomStyleParams,
  type StyleTag,
} from '../../core'
import { RoomStyleEditor } from './room-style-editor'

// A single tagged room, fixed so the displayed value and any dispatched command
// payload are both deterministic.
const ROOM_KEY = 'wall-1|wall-2|wall-3'
const SEEDED_STYLE_ID = 'queen-anne'
const SEEDED_STYLE_NAME = 'Queen Anne'
const CHOSEN_STYLE_ID = 'craftsman'

const SEEDED_STYLE: StyleTag = { styleId: SEEDED_STYLE_ID }

function renderEditor(style: StyleTag | undefined, dispatch: (command: unknown) => void) {
  render(<RoomStyleEditor roomKey={ROOM_KEY} style={style} dispatch={dispatch} />)
}

function lastCommand(dispatch: ReturnType<typeof vi.fn>): Command<SetRoomStyleParams> {
  return dispatch.mock.calls[0]?.[0] as Command<SetRoomStyleParams>
}

afterEach(cleanup)

describe('RoomStyleEditor', () => {
  it('shows the seeded style id as the selected value of a labeled style select', () => {
    renderEditor(SEEDED_STYLE, vi.fn())

    expect(screen.getByLabelText('Style')).toHaveValue(SEEDED_STYLE_ID)
  })

  it('offers a leading Inherit option and a named option per builtin style', () => {
    renderEditor(SEEDED_STYLE, vi.fn())

    const select = screen.getByLabelText('Style')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Inherit')
    expect(options[0]).toHaveValue('')
    expect(options).toHaveLength(Object.keys(builtinStyles.entries).length + 1)
    expect(select).toContainElement(screen.getByRole('option', { name: SEEDED_STYLE_NAME }))
    expect(select).toContainElement(screen.getByRole('option', { name: 'Folk Victorian' }))
  })

  it('dispatches setRoomStyle with the chosen style id when a style is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_STYLE, dispatch)

    await user.selectOptions(screen.getByLabelText('Style'), CHOSEN_STYLE_ID)

    const expected = setRoomStyle(ROOM_KEY, { styleId: CHOSEN_STYLE_ID })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })

  it('dispatches setRoomStyle with undefined when the Inherit option is selected', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    renderEditor(SEEDED_STYLE, dispatch)

    await user.selectOptions(screen.getByLabelText('Style'), '')

    const expected = setRoomStyle(ROOM_KEY, undefined)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(lastCommand(dispatch).type).toBe(expected.type)
    expect(lastCommand(dispatch).params).toEqual(expected.params)
  })
})
