import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
})
