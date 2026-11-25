import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FailedOpenDialog, type FailedOpenDetails } from './failed-open-dialog'

afterEach(cleanup)

const DETAILS: FailedOpenDetails = {
  error: 'The document breaks the format rules at 1 place.',
  faults: [{ path: '/paint/3/patternId', message: 'The field is not defined for a solid color.' }],
  formatVersion: 17,
  build: '0.3.0',
  removedPaths: [],
}

function renderDialog() {
  render(<FailedOpenDialog cause="format-rules" details={DETAILS} onClose={vi.fn()} />)
  return { user: userEvent.setup(), dialog: screen.getByRole('alertdialog') }
}

describe('the keyboard in the failed-open dialog', () => {
  it('reaches the "Technical details" summary with Tab from the last control', async () => {
    const { user, dialog } = renderDialog()
    const close = within(dialog).getByRole('button', { name: 'Close' })
    expect(close).toHaveFocus()

    await user.tab()

    expect(within(dialog).getByText('Technical details')).toHaveFocus()
  })

  it('goes back from the summary to Close with Shift+Tab', async () => {
    const { user, dialog } = renderDialog()
    await user.tab()
    expect(within(dialog).getByText('Technical details')).toHaveFocus()

    await user.tab({ shift: true })

    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
  })
})
