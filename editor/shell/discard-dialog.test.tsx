import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscardDialog } from './discard-dialog'

afterEach(cleanup)

describe('DiscardDialog', () => {
  it('names the project and routes confirm and cancel to their callbacks', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={onConfirm} onCancel={onCancel} />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/discard unsaved changes/i)
    expect(dialog).toHaveTextContent(/Hubbard House/)

    const cancel = within(dialog).getByRole('button', { name: /cancel/i })
    const discard = within(dialog).getByRole('button', { name: /discard/i })
    expect(cancel).toHaveClass('ds-button')
    expect(discard).toHaveClass('ds-button')

    await user.click(cancel)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(discard)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders nothing while closed', () => {
    render(
      <DiscardDialog
        open={false}
        projectName="Hubbard House"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
