import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloorSwitcher } from './floor-switcher'

afterEach(cleanup)

const floors = [
  { id: 'f1', name: 'Ground' },
  { id: 'f2', name: 'Upper' },
]

describe('FloorSwitcher', () => {
  it('lists every floor, marks the active floor, and reports the clicked selection', async () => {
    const onSelectFloor = vi.fn()
    const user = userEvent.setup()

    render(
      <FloorSwitcher
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={onSelectFloor}
        onAddFloor={vi.fn()}
      />,
    )

    const ground = screen.getByRole('button', { name: /Ground/ })
    const upper = screen.getByRole('button', { name: /Upper/ })

    expect(ground).toHaveAttribute('aria-pressed', 'true')
    expect(upper).toHaveAttribute('aria-pressed', 'false')

    await user.click(upper)

    expect(onSelectFloor).toHaveBeenCalledTimes(1)
    expect(onSelectFloor).toHaveBeenCalledWith('f2')
  })
})
