import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBar } from './status-bar'

afterEach(cleanup)

const floors = [
  { id: 'f1', name: 'Ground' },
  { id: 'f2', name: 'Upper' },
]

describe('StatusBar', () => {
  it('renders a floor selector navigation', () => {
    render(
      <StatusBar floors={floors} activeFloorId="f1" onSelectFloor={vi.fn()} onAddFloor={vi.fn()} />,
    )
    expect(screen.getByRole('navigation', { name: /floors/i })).toBeInTheDocument()
  })

  it('calls onSelectFloor when an inactive tab is clicked', async () => {
    const user = userEvent.setup()
    const onSelectFloor = vi.fn()
    render(
      <StatusBar
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={onSelectFloor}
        onAddFloor={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Upper/ }))
    expect(onSelectFloor).toHaveBeenCalledWith('f2')
  })
})
