import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloorSwitcher } from './floor-switcher'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

const NEW_NAME = 'Cellar'

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
async function startRenameWithTypedName() {
  const user = userEvent.setup()
  const onRenameFloor = vi.fn()
  render(
    <FloorSwitcher
      floors={[{ id: 'f1', name: 'Ground', elevation: 0 }]}
      activeFloorId="f1"
      onSelectFloor={vi.fn()}
      onAddFloor={vi.fn()}
      onRenameFloor={onRenameFloor}
    />,
  )
  await user.click(screen.getByRole('button', { name: /rename floor/i }))
  const input = screen.getByRole('textbox', { name: /floor name/i })
  await user.clear(input)
  await user.type(input, NEW_NAME)
  return { user, input, onRenameFloor }
}

function submitFormOf(input: HTMLElement) {
  const form = input.closest('form')
  if (!form) throw new Error('the floor name field is not inside a form')
  fireEvent.submit(form)
}

describe('a key of a text composition in the floor name field', () => {
  it('keeps the rename open with the typed name on an Escape marked as composing', async () => {
    const { input, onRenameFloor } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(onRenameFloor).toHaveBeenCalledTimes(0)
  })

  it('keeps the rename open with the typed name on an Escape with the legacy composition key code', async () => {
    const { input, onRenameFloor } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', keyCode: COMPOSITION_KEY_CODE })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(onRenameFloor).toHaveBeenCalledTimes(0)
  })

  it('cancels the rename on the plain Escape after a composing Escape', async () => {
    const { user, input, onRenameFloor } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(input).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(onRenameFloor).toHaveBeenCalledTimes(0)
  })

  it('commits the typed name once when the form is submitted after a composing Escape', async () => {
    const { input, onRenameFloor } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    submitFormOf(input)

    expect(onRenameFloor).toHaveBeenCalledTimes(1)
    expect(onRenameFloor).toHaveBeenCalledWith('f1', NEW_NAME)
  })

  it('commits nothing on an Enter marked as composing', async () => {
    const { input, onRenameFloor } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onRenameFloor).toHaveBeenCalledTimes(0)
  })
})

describe('a plain Escape in the floor name field', () => {
  it('cancels the rename without committing the typed name', async () => {
    const { user, input, onRenameFloor } = await startRenameWithTypedName()

    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(onRenameFloor).toHaveBeenCalledTimes(0)
  })
})
