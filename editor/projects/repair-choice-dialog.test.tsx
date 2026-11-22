import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RepairChoiceDialog, type RepairChoiceDialogProps } from './repair-choice-dialog'

afterEach(cleanup)

const TITLE = 'Open the repaired project'
const OPEN_AS_NEW = 'Open as a new project'
const REPLACE = 'Replace the stored project'
const CANCEL = 'Cancel'
const NEW_PROJECT_SENTENCE =
  'A new file stores a repaired version of this project. The stored file stays unchanged.'
const FILE_SENTENCE =
  'A new file stores a repaired version of this project. The file that you chose stays unchanged.'
const WARNING = 'The data that the repair removes is lost. You cannot undo this action.'

/** Renders the dialog with a handler for each choice, and gives a user, the handlers, and the dialog. */
function renderDialog(changes: Partial<RepairChoiceDialogProps> = {}) {
  const onReplace = vi.fn()
  const onOpenAsNew = vi.fn()
  const onCancel = vi.fn()
  render(
    <RepairChoiceDialog
      onReplace={onReplace}
      onOpenAsNew={onOpenAsNew}
      onCancel={onCancel}
      {...changes}
    />,
  )
  const dialog = screen.getByRole('alertdialog')
  return { user: userEvent.setup(), onReplace, onOpenAsNew, onCancel, dialog }
}

describe('the dialog that offers a repaired project as a new one or in place of the stored one', () => {
  it('shows "Open as a new project" first, as the primary control, with the first focus', () => {
    const { dialog } = renderDialog()

    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([OPEN_AS_NEW, REPLACE, CANCEL])
    expect(buttons[0]).toHaveClass('ds-button--primary')
    expect(buttons[0]).toHaveFocus()
  })

  it('shows "Replace the stored project" with the warning as its description', () => {
    const { dialog } = renderDialog()

    const replace = within(dialog).getByRole('button', { name: REPLACE })
    expect(replace).toHaveAccessibleDescription(WARNING)
    expect(dialog).toHaveTextContent(WARNING)
  })

  it('says that a new project holds the repaired data and that the stored project stays unchanged', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveTextContent(NEW_PROJECT_SENTENCE)
  })

  it('Cancel and Escape call onCancel', async () => {
    const { user, onCancel, onOpenAsNew, onReplace } = renderDialog()

    await user.click(screen.getByRole('button', { name: CANCEL }))
    expect(onCancel).toHaveBeenCalledOnce()

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onOpenAsNew).not.toHaveBeenCalled()
    expect(onReplace).not.toHaveBeenCalled()
  })

  it('each choice calls its handler once', async () => {
    const { user, onOpenAsNew, onReplace, onCancel } = renderDialog()

    await user.click(screen.getByRole('button', { name: OPEN_AS_NEW }))
    expect(onOpenAsNew).toHaveBeenCalledOnce()
    expect(onReplace).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: REPLACE }))
    expect(onReplace).toHaveBeenCalledOnce()
    expect(onOpenAsNew).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('without a replace handler, shows no replace control and no warning', () => {
    const { dialog } = renderDialog({ onReplace: undefined })

    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([OPEN_AS_NEW, CANCEL])
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
  })

  it('without a replace handler, says that the file that you chose stays unchanged', () => {
    const { dialog } = renderDialog({ onReplace: undefined })

    expect(dialog).toHaveTextContent(FILE_SENTENCE)
    expect(dialog).not.toHaveTextContent('stored file')
  })

  it('while a choice runs, Escape does nothing', async () => {
    const { user, onCancel } = renderDialog({ busy: true })

    await user.keyboard('{Escape}')

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('while a choice runs, every control is disabled', () => {
    const { dialog } = renderDialog({ busy: true })

    const buttons = within(dialog).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) expect(button).toBeDisabled()
  })

  it('is an alert dialog that its title labels', () => {
    renderDialog()

    const dialog = screen.getByRole('alertdialog', { name: TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})
