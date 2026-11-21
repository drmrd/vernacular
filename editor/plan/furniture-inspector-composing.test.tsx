import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SET_FURNITURE_NAME, createFurnitureInstance, type Command } from '../../core'
import { FurnitureInspector } from './furniture-inspector'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229
const FLOOR_ID = 'floor-1'
const FURNITURE_ID = 'f1'
const TYPED_NAME = 'Reading Chair'

function renderEditedField() {
  const dispatch = vi.fn()
  const furniture = createFurnitureInstance({
    id: FURNITURE_ID,
    assetRef: { scope: 'user', contentHash: 'h' },
    position: { x: 0, y: 0 },
    footprint: { width: 600, depth: 400 },
    height: 750,
    rotation: 0,
    name: 'Chair',
  })
  render(
    <FurnitureInspector
      floorId={FLOOR_ID}
      furniture={furniture}
      units="metric"
      dispatch={dispatch as never}
    />,
  )
  const input = screen.getByLabelText('Name')
  input.focus()
  fireEvent.change(input, { target: { value: TYPED_NAME } })
  return { input, dispatch }
}

function nameCommands(dispatch: ReturnType<typeof vi.fn>): Command[] {
  return dispatch.mock.calls
    .map((call) => call[0] as Command)
    .filter((command) => command.type === SET_FURNITURE_NAME)
}

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
describe('a key of a text composition in the furniture name field', () => {
  it('commits nothing on an Enter marked as composing', () => {
    const { input, dispatch } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(nameCommands(dispatch)).toHaveLength(0)
  })

  it('commits nothing on an Enter with the legacy composition key code', () => {
    const { input, dispatch } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', keyCode: COMPOSITION_KEY_CODE })

    expect(nameCommands(dispatch)).toHaveLength(0)
  })

  it('commits once with the typed name on the plain Enter after a composing Enter', async () => {
    const { input, dispatch } = renderEditedField()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await userEvent.keyboard('{Enter}')

    const commands = nameCommands(dispatch)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.params).toEqual({
      floorId: FLOOR_ID,
      furnitureId: FURNITURE_ID,
      name: TYPED_NAME,
    })
  })
})
