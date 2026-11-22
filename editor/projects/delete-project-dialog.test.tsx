import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteProjectDialog } from './delete-project-dialog'

afterEach(cleanup)

const NAME = 'Hubbard House'
const EXPLANATION =
  'This removes the project and its recovery copies from this browser. You cannot undo this action.'

/** Renders the dialog for the project named Hubbard House, and gives a user, its answers, and the dialog. */
function renderDialog() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<DeleteProjectDialog name={NAME} onConfirm={onConfirm} onCancel={onCancel} />)
  const dialog = screen.getByRole('alertdialog')
  return { user: userEvent.setup(), onConfirm, onCancel, dialog }
}

describe('the dialog that asks before a project is deleted', () => {
  it('is an alert dialog named with the name of the project in a question', () => {
    renderDialog()

    expect(screen.getByRole('alertdialog', { name: `Delete "${NAME}"?` })).toBeInTheDocument()
  })

  it('says that the project and its recovery copies go from this browser and that this cannot be undone', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveAccessibleDescription(EXPLANATION)
    expect(dialog).toHaveTextContent(EXPLANATION)
  })

  it('offers Cancel and Delete project, with the focus on Cancel', () => {
    const { dialog } = renderDialog()

    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Delete project'])
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const { user, dialog } = renderDialog()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' })

    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
  })

  it('calls onConfirm once, and not onCancel, when Delete project is chosen', async () => {
    const { user, onConfirm, onCancel } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete project' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel, and not onConfirm, when Cancel is chosen', async () => {
    const { user, onConfirm, onCancel } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel, and not onConfirm, when Escape is pressed', async () => {
    const { user, onConfirm, onCancel } = renderDialog()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel once when Escape is pressed on the shade, and no wrapper around the dialog sees it', () => {
    const onCancel = vi.fn()
    const onWrapperKeyDown = vi.fn()
    render(
      // The wrapper only listens: it stands for whatever surrounds the dialog on a page.
      <div onKeyDown={onWrapperKeyDown}>
        <DeleteProjectDialog name={NAME} onConfirm={vi.fn()} onCancel={onCancel} />
      </div>,
    )
    const shade = screen.getByRole('alertdialog').parentElement
    if (shade === null) throw new Error('The dialog has no shade around it')

    fireEvent.keyDown(shade, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onWrapperKeyDown).not.toHaveBeenCalled()
  })
})
