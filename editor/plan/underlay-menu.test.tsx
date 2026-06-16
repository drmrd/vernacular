import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnderlayMenu } from './underlay-menu'

const FLOOR_ID = 'ground'

afterEach(cleanup)

describe('UnderlayMenu', () => {
  it('renders a closed Underlay launcher with no Load image item when there are no underlays', () => {
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[]}
        dispatch={vi.fn()}
        onLoadImage={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /underlay/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/load image/i)).not.toBeInTheDocument()
  })

  it('opens the flyout to reveal a Load image item and reflects the expanded state', async () => {
    const user = userEvent.setup()
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[]}
        dispatch={vi.fn()}
        onLoadImage={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /underlay/i })
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: /load image/i })).toBeInTheDocument()
  })

  it('closes the flyout when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[]}
        dispatch={vi.fn()}
        onLoadImage={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /underlay/i })
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: /load image/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menuitem', { name: /load image/i })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the flyout on a pointer-down outside the menu', async () => {
    const user = userEvent.setup()
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[]}
        dispatch={vi.fn()}
        onLoadImage={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /underlay/i })
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: /load image/i })).toBeInTheDocument()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menuitem', { name: /load image/i })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
