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

  it('lifts the prompt out of page flow into a backdrop wrapper', () => {
    // The prompt renders as a sibling of the AppFrame, whose root fills the
    // viewport and hides its overflow. Left in page flow the prompt lays out a
    // whole viewport below the fold, so New with unsaved work reads as a dead
    // click. A backdrop wrapper is what the stylesheet pins to the viewport.
    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={() => {}} onCancel={() => {}} />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog.parentElement).toHaveClass('discard-dialog__backdrop')
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
