import { describe, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from './use-focus-trap'

afterEach(cleanup)

function StraySummaryDialog() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Stray summary">
      <input aria-label="First field" />
      <button type="button">Last control</button>
      <summary>Not in a details</summary>
    </div>
  )
}

function SecondSummaryDialog() {
  const ref = useFocusTrap<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Second summary">
      <input aria-label="First field" />
      <button type="button">Last control</button>
      <details>
        <summary>Opens the details</summary>
        <summary>A second summary</summary>
      </details>
    </div>
  )
}

describe('useFocusTrap and a summary that a browser does not focus', () => {
  it('wraps Tab from the last real control to the first when a summary outside any details ends the container', async () => {
    const user = userEvent.setup()
    render(<StraySummaryDialog />)

    screen.getByRole('button', { name: 'Last control' }).focus()
    await user.tab()

    expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus()
  })

  it('wraps Tab from the last real control to the first when a second summary in a details ends the container', async () => {
    const user = userEvent.setup()
    render(<SecondSummaryDialog />)
    screen.getByText('Opens the details').focus()

    await user.tab()

    expect(screen.getByRole('textbox', { name: 'First field' })).toHaveFocus()
  })
})
