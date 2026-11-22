import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardRenameForm } from './card-rename-form'

afterEach(cleanup)

const NAME = 'Hubbard House'
const NEW_NAME = 'Hubbard Manor'

function renderForm(onSave: (name: string) => Promise<boolean> = () => Promise.resolve(true)) {
  const save = vi.fn(onSave)
  const onCancel = vi.fn()
  render(<CardRenameForm name={NAME} onSave={save} onCancel={onCancel} />)
  return {
    user: userEvent.setup(),
    onSave: save,
    onCancel,
    field: screen.getByRole<HTMLInputElement>('textbox', { name: 'Project name' }),
  }
}

describe('the rename form of a card', () => {
  it('holds the name in a focused field with its text selected', () => {
    const { field } = renderForm()

    expect(field).toHaveValue(NAME)
    expect(field).toHaveFocus()
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, NAME.length])
  })

  it('saves the trimmed name from "Save name"', async () => {
    const { user, onSave, field } = renderForm()
    await user.clear(field)
    await user.type(field, `  ${NEW_NAME}  `)

    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(onSave.mock.calls).toEqual([[NEW_NAME]])
  })

  it('saves the trimmed name from Enter', async () => {
    const { user, onSave, field } = renderForm()
    await user.clear(field)
    await user.type(field, `  ${NEW_NAME}  {Enter}`)

    expect(onSave.mock.calls).toEqual([[NEW_NAME]])
  })

  it('cancels, and never saves, for a blank name and for an unchanged name', async () => {
    const { user, onSave, onCancel, field } = renderForm()
    await user.clear(field)
    await user.type(field, '   ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await user.clear(field)
    await user.type(field, ` ${NAME} `)
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('cancels on "Cancel" and on Escape, but not on Escape during a composition', async () => {
    const { user, onCancel, field } = renderForm()

    fireEvent.keyDown(field, { key: 'Escape', isComposing: true })
    expect(onCancel).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.type(field, '{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('does not save again while a save runs', async () => {
    const { user, onSave, field } = renderForm(() => new Promise<boolean>(() => undefined))
    await user.clear(field)
    await user.type(field, NEW_NAME)

    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await user.type(field, '{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(onSave).toHaveBeenCalledOnce()
  })

  it('still shows the typed text after a save that resolved false', async () => {
    const { user, onSave, field } = renderForm(() => Promise.resolve(false))
    await user.clear(field)
    await user.type(field, NEW_NAME)

    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue(NEW_NAME)
  })
})
