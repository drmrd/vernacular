import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, ToastRegion, useNotifications } from './index'

function EmitButton() {
  const { error } = useNotifications()
  return (
    <button type="button" onClick={() => error('Save failed')}>
      break
    </button>
  )
}

describe('notification wiring', () => {
  it('shows an emitted error toast in the region', async () => {
    render(
      <NotificationProvider>
        <EmitButton />
        <ToastRegion />
      </NotificationProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'break' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
  })
})
