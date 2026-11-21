import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setRoomSubPurpose } from '../../core'
import { RoomSubPurposeEditor } from './room-sub-purpose-editor'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

const ROOM_KEY = 'wall-1|wall-2|wall-3'
const TYPED_SUB_PURPOSE = 'Cold Pantry'

function renderEditedField() {
  const commit = vi.fn()
  render(<RoomSubPurposeEditor roomKey={ROOM_KEY} subPurpose="Silver Pantry" dispatch={commit} />)
  const input = screen.getByLabelText('Sub-purpose')
  input.focus()
  fireEvent.change(input, { target: { value: TYPED_SUB_PURPOSE } })
  return { input, commit }
}

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
describe('a key of a text composition in the room sub-purpose field', () => {
  it('commits nothing on an Enter marked as composing', () => {
    const { input, commit } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(commit).toHaveBeenCalledTimes(0)
  })

  it('commits nothing on an Enter with the legacy composition key code', () => {
    const { input, commit } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', keyCode: COMPOSITION_KEY_CODE })

    expect(commit).toHaveBeenCalledTimes(0)
  })

  it('commits once with the typed value on the plain Enter after a composing Enter', async () => {
    const { input, commit } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await userEvent.keyboard('{Enter}')

    expect(commit).toHaveBeenCalledTimes(1)
    const expected = setRoomSubPurpose(ROOM_KEY, TYPED_SUB_PURPOSE)
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ type: expected.type, params: expected.params }),
    )
  })
})
