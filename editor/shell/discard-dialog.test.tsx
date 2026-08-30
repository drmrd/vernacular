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

  it('asks the caller-supplied question in place of the unsaved-changes default', () => {
    // The recovery banner's Discard deletes recovered snapshots, not the open
    // document, so the seam it shares with New and Open has to be able to say so.
    render(
      <DiscardDialog
        open
        projectName="Hubbard House"
        message="Delete the recovered copy of Hubbard House?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete the recovered copy of Hubbard House?')
    expect(dialog).not.toHaveTextContent(/discard unsaved changes/i)
  })

  it('lets the caller name the destructive answer as well as the question', async () => {
    // The button is what the user aims at, so it carries the same ambiguity the
    // banner's bare "Discard" did: next to a recovery question it reads as throwing
    // away the unsaved edits rather than the recovered copy.
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <DiscardDialog
        open
        projectName="Hubbard House"
        message="Delete the recovered copy of Hubbard House?"
        confirmLabel="Delete recovered copy"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).queryByRole('button', { name: 'Discard' })).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Delete recovered copy' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('falls back to Discard when the caller names no destructive answer', () => {
    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('opens with focus on Cancel and keeps Tab inside the prompt', async () => {
    // An alertdialog that leaves focus behind it is answerable only with the
    // mouse, and Tab walks away into a frame the prompt is blocking. Cancel takes
    // first focus because it is the non-destructive answer.
    const user = userEvent.setup()

    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={() => {}} onCancel={() => {}} />,
    )

    const dialog = screen.getByRole('alertdialog')
    const cancel = within(dialog).getByRole('button', { name: /cancel/i })
    const discard = within(dialog).getByRole('button', { name: /discard/i })
    expect(cancel).toHaveFocus()

    await user.tab()
    expect(discard).toHaveFocus()

    await user.tab()
    expect(cancel).toHaveFocus()
  })

  it('survives a click on the shaded surround with its modality intact', async () => {
    // Clicking the shade is an ordinary dismissal reflex. With the trap and the
    // Escape handler bound to the inner panel alone, that click left focus on the
    // body: Escape stopped answering and the next Tab reached a control behind the
    // prompt, which is how a live prompt could be answered by proxy.
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={() => {}} onCancel={onCancel} />,
    )

    const dialog = screen.getByRole('alertdialog')
    const backdrop = dialog.parentElement as HTMLElement
    await user.click(backdrop)

    // The shade has to be part of the prompt's focus surface. A shade that cannot
    // hold focus hands it to the document body instead, and from there neither the
    // trap nor the Escape handler, both bound inside the prompt, ever see another
    // key.
    expect(backdrop).toHaveFocus()

    // Tab still lands inside the prompt rather than on the frame behind it.
    await user.tab()
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('marks itself modal so assistive technology ignores the frame behind it', () => {
    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('treats Escape as cancel', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <DiscardDialog open projectName="Hubbard House" onConfirm={onConfirm} onCancel={onCancel} />,
    )

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
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
