import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectMenu } from './project-menu'

afterEach(cleanup)

// Some engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

const OLD_NAME = 'Eastmore Farmstead'
const NEW_NAME = 'Cedar Hollow'

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
async function startRenameWithTypedName() {
  const user = userEvent.setup()
  const onRename = vi.fn()
  render(<ProjectMenu onNewProject={vi.fn()} projectName={OLD_NAME} onRename={onRename} />)
  await user.click(screen.getByRole('button', { name: /project/i }))
  await user.click(screen.getByRole('menuitem', { name: /^rename$/i }))
  const input = screen.getByRole('textbox', { name: /project name/i })
  await user.clear(input)
  await user.type(input, NEW_NAME)
  return { user, input, onRename }
}

function submitFormOf(input: HTMLElement) {
  const form = input.closest('form')
  if (!form) throw new Error('the project name field is not inside a form')
  fireEvent.submit(form)
}

describe('a key of a text composition in the project name field', () => {
  it('keeps the rename open with the typed name on an Escape marked as composing', async () => {
    const { input, onRename } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(onRename).toHaveBeenCalledTimes(0)
  })

  it('keeps the rename open with the typed name on an Escape with the legacy composition key code', async () => {
    const { input, onRename } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', keyCode: COMPOSITION_KEY_CODE })

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(NEW_NAME)
    expect(onRename).toHaveBeenCalledTimes(0)
  })

  it('cancels the rename on the plain Escape after a composing Escape', async () => {
    const { user, input, onRename } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(input).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(onRename).toHaveBeenCalledTimes(0)
  })

  it('commits the typed name once when the form is submitted after a composing Escape', async () => {
    const { input, onRename } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    submitFormOf(input)

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith(NEW_NAME)
  })

  it('commits nothing on an Enter marked as composing', async () => {
    const { input, onRename } = await startRenameWithTypedName()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onRename).toHaveBeenCalledTimes(0)
  })
})

describe('a plain Escape in the project name field', () => {
  it('cancels the rename without committing the typed name', async () => {
    const { user, input, onRename } = await startRenameWithTypedName()

    await user.keyboard('{Escape}')

    expect(input).not.toBeInTheDocument()
    expect(onRename).toHaveBeenCalledTimes(0)
  })
})
