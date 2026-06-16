import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportAlert } from './import-alert'

afterEach(cleanup)

describe('ImportAlert', () => {
  it('announces the failed file and reason and dismisses on request', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const { rerender } = render(
      <ImportAlert status={{ fileName: 'x.building', reason: 'corrupt' }} onDismiss={onDismiss} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/x\.building/)
    expect(screen.getByRole('alert')).toHaveTextContent(/corrupt/)

    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()

    rerender(<ImportAlert status={null} onDismiss={onDismiss} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
