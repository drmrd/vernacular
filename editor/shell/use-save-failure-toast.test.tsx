import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, ToastRegion } from '../design-system'
import { useSaveFailureToast } from './use-save-failure-toast'
import type { AutosaveStatus } from '../../bridge'

function SaveStatusProbe({ status }: { status: AutosaveStatus }) {
  useSaveFailureToast(status)
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
})
