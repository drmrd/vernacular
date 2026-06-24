import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationProvider, ToastRegion } from '../design-system'
import { useSaveFailureToast } from './use-save-failure-toast'
import type { AutosaveStatus } from '../../bridge'

function SaveStatusProbe({
  status,
  onRetry,
}: {
  status: AutosaveStatus
  onRetry?: () => void
}) {
  useSaveFailureToast(status, onRetry)
  return null
}

describe('useSaveFailureToast', () => {
  it('raises an error toast when the autosave status transitions into error', () => {
    let setStatus: (status: AutosaveStatus) => void = () => {}

    function Harness() {
      const [status, set] = useState<AutosaveStatus>('pending')
      setStatus = set
      return (
        <NotificationProvider>
          <SaveStatusProbe status={status} />
          <ToastRegion />
        </NotificationProvider>
      )
    }

    render(<Harness />)
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => {
      setStatus('error')
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i)
  })

  it('offers a Retry action that invokes the callback when one is provided', async () => {
    const onRetry = vi.fn()
    let setStatus: (status: AutosaveStatus) => void = () => {}

    function Harness() {
      const [status, set] = useState<AutosaveStatus>('pending')
      setStatus = set
      return (
        <NotificationProvider>
          <SaveStatusProbe status={status} onRetry={onRetry} />
          <ToastRegion />
        </NotificationProvider>
      )
    }

    render(<Harness />)

    act(() => {
      setStatus('error')
    })

    const retry = screen.getByRole('button', { name: 'Retry' })
    await userEvent.click(retry)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('raises a bare error toast with no Retry action when no callback is provided', () => {
    let setStatus: (status: AutosaveStatus) => void = () => {}

    function Harness() {
      const [status, set] = useState<AutosaveStatus>('pending')
      setStatus = set
      return (
        <NotificationProvider>
          <SaveStatusProbe status={status} />
          <ToastRegion />
        </NotificationProvider>
      )
    }

    render(<Harness />)

    act(() => {
      setStatus('error')
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})
