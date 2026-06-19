import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Underlay } from '../../core'
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

  it('routes the trigger through the Button primitive while keeping its menu a11y attributes', () => {
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
    expect(trigger).toHaveClass('ds-button')
  })

  it('opens onto a design-system menu surface whose Load image row routes through the Button primitive', async () => {
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

    await user.click(screen.getByRole('button', { name: /underlay/i }))

    expect(screen.getByRole('menu')).toHaveClass('ds-menu-surface')
    expect(screen.getByRole('menuitem', { name: /load image/i })).toHaveClass('ds-button')
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

  it('invokes onLoadImage once and closes the flyout when Load image is clicked', async () => {
    const user = userEvent.setup()
    const onLoadImage = vi.fn()
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[]}
        dispatch={vi.fn()}
        onLoadImage={onLoadImage}
        onCalibrate={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /underlay/i })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: /load image/i }))

    expect(onLoadImage).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it("renders a row per underlay whose Calibrate button reports the underlay's id", async () => {
    const user = userEvent.setup()
    const underlay = { id: 'u1', opacity: 0.5, visible: true } as Underlay
    const onCalibrate = vi.fn()
    render(
      <UnderlayMenu
        floorId={FLOOR_ID}
        underlays={[underlay]}
        dispatch={vi.fn()}
        onLoadImage={vi.fn()}
        onCalibrate={onCalibrate}
      />,
    )

    await user.click(screen.getByRole('button', { name: /underlay/i }))

    expect(screen.getByRole('slider')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /visible/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /calibrate/i }))

    expect(onCalibrate).toHaveBeenCalledWith('u1')
  })
})
