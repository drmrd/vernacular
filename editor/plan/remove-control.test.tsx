import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RemoveControl } from './remove-control'

afterEach(cleanup)

describe('RemoveControl', () => {
  it('arms the control on the first Remove click without confirming', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<RemoveControl targetId="a" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onConfirm when Confirm remove is clicked while armed', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<RemoveControl targetId="a" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Confirm remove' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('returns to the unarmed Remove state when Cancel is clicked, without confirming', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<RemoveControl targetId="a" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).toBeNull()
  })

  it('resets to the unarmed state when targetId changes while armed, and never confirms the old arm', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<RemoveControl targetId="dimension-a" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()

    // Retarget the SAME mounted control to a different target. A remount would
    // hide the bug this test pins down, so this rerenders in place.
    rerender(<RemoveControl targetId="dimension-b" onConfirm={onConfirm} />)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('stays armed across a rerender that keeps the same targetId', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<RemoveControl targetId="dimension-a" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    rerender(<RemoveControl targetId="dimension-a" onConfirm={onConfirm} />)

    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeInTheDocument()
  })
})
