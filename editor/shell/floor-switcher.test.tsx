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

  it('renders Add floor as a design-system button', () => {
    render(
      <FloorSwitcher
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={vi.fn()}
        onAddFloor={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /add floor/i })).toHaveClass('ds-button')
  })

  it('still fires onAddFloor when the Add floor button is clicked', async () => {
    const onAddFloor = vi.fn()
    const user = userEvent.setup()

    render(
      <FloorSwitcher
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={vi.fn()}
        onAddFloor={onAddFloor}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add floor/i }))

    expect(onAddFloor).toHaveBeenCalledTimes(1)
  })

  it('orders floors from the highest elevation down so basements sit at the bottom', () => {
    render(
      <FloorSwitcher
        floors={[
          { id: 'ground', name: 'Ground', elevation: 0 },
          { id: 'basement', name: 'Basement', elevation: -3000 },
          { id: 'upper', name: '2nd Floor', elevation: 3000 },
        ]}
        activeFloorId="ground"
        onSelectFloor={vi.fn()}
        onAddFloor={vi.fn()}
      />,
    )

    const tabs = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('ds-segmented__option'))

    expect(tabs.map((tab) => tab.textContent)).toEqual(['2nd Floor', 'Ground', 'Basement'])
  })

  it('adds an upper floor above the ground with the default ordinal name', async () => {
    const onAddFloor = vi.fn()
    const user = userEvent.setup()

    render(
      <FloorSwitcher
        floors={[{ id: 'ground', name: 'Ground', elevation: 0 }]}
        activeFloorId="ground"
        onSelectFloor={vi.fn()}
        onAddFloor={onAddFloor}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add floor/i }))

    expect(onAddFloor).toHaveBeenCalledWith({ name: '2nd Floor', elevation: 3000 })
  })

  it('adds a basement below the ground with a negative elevation', async () => {
    const onAddFloor = vi.fn()
    const user = userEvent.setup()

    render(
      <FloorSwitcher
        floors={[{ id: 'ground', name: 'Ground', elevation: 0 }]}
        activeFloorId="ground"
        onSelectFloor={vi.fn()}
        onAddFloor={onAddFloor}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add basement/i }))

    expect(onAddFloor).toHaveBeenCalledWith({ name: 'Basement', elevation: -3000 })
  })

  it('routes the floor tabs through the design-system Segmented option vocabulary', () => {
    render(
      <FloorSwitcher
        floors={floors}
        activeFloorId="f1"
        onSelectFloor={vi.fn()}
        onAddFloor={vi.fn()}
      />,
    )

    const ground = screen.getByRole('button', { name: /Ground/ })
    const upper = screen.getByRole('button', { name: /Upper/ })

    for (const tab of [ground, upper]) {
      expect(tab).toHaveClass('ds-segmented__option')
      expect(tab).not.toHaveClass('floor-switcher__tab')
    }

    expect(ground).toHaveClass('is-active')
    expect(ground).toHaveAttribute('aria-pressed', 'true')
    expect(upper).not.toHaveClass('is-active')
  })
})
