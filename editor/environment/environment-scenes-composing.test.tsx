import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_ENVIRONMENT_STATE, type EnvironmentScene } from '../../core'
import { EnvironmentScenes } from './environment-scenes'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

const SAVED_SCENE: EnvironmentScene = {
  id: 'scene-winter-dusk',
  name: 'Winter dusk',
  observedAt: '2026-12-21T16:30',
  weather: { cloudCover: 0.2 },
}
const RENAME_LABEL = `Rename ${SAVED_SCENE.name}`
const NEW_NAME = 'Summer noon'

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
async function startRenameWithTypedName() {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  render(
    <EnvironmentScenes
      scenes={[SAVED_SCENE]}
      environment={DEFAULT_ENVIRONMENT_STATE}
      onEnvironmentChange={vi.fn()}
      dispatch={dispatch}
    />,
  )
  await user.click(screen.getByRole('button', { name: RENAME_LABEL }))
  const input = screen.getByRole('textbox', { name: RENAME_LABEL })
  await user.clear(input)
  await user.type(input, NEW_NAME)
  return { user, input, dispatch }
}

function submitFormOf(input: HTMLElement) {
  const form = input.closest('form')
  if (!form) throw new Error('the scene name field is not inside a form')
  fireEvent.submit(form)
}

describe('a key of a text composition in the scene name field', () => {
  it('keeps the rename open with the typed name on an Escape marked as composing', async () => {
    const { input, dispatch } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  it('keeps the rename open with the typed name on an Escape with the legacy composition key code', async () => {
    const { input, dispatch } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', keyCode: COMPOSITION_KEY_CODE })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  it('cancels the rename on the plain Escape after a composing Escape', async () => {
    const { user, input, dispatch } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(input).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(dispatch).toHaveBeenCalledTimes(0)
  })

  it('commits the typed name once when the form is submitted after a composing Escape', async () => {
    const { input, dispatch } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    submitFormOf(input)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'environment-scene/rename',
      params: { id: SAVED_SCENE.id, name: NEW_NAME },
      description: expect.any(String),
    })
  })

  it('commits nothing on an Enter marked as composing', async () => {
    const { input, dispatch } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(dispatch).toHaveBeenCalledTimes(0)
  })
})

describe('a plain Escape in the scene name field', () => {
  it('cancels the rename without committing the typed name', async () => {
    const { user, input, dispatch } = await startRenameWithTypedName()

    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(dispatch).toHaveBeenCalledTimes(0)
  })
})
