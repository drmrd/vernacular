import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AngleField } from './angle-field'
import { DEG_TO_RAD } from './angles'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

const TYPED_DEGREES = '45'

function renderEditedField() {
  const commit = vi.fn()
  render(<AngleField inputId="stair-angle-s1" rotation={Math.PI / 2} onCommit={commit} />)
  const input = screen.getByLabelText('Angle (deg)')
  input.focus()
  fireEvent.change(input, { target: { value: TYPED_DEGREES } })
  return { input, commit }
}

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
describe('a key of a text composition in the angle field', () => {
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
    expect(commit).toHaveBeenCalledWith(Number(TYPED_DEGREES) * DEG_TO_RAD)
  })
})
