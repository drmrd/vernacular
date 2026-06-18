import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoomFinishSection } from './room-finish-section'

afterEach(cleanup)

describe('RoomFinishSection', () => {
  it('renders Floor and Ceiling chips for the room floor surfaces', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ceiling' })).toBeInTheDocument()
  })

  it('routes the surface chips through the design-system Segmented option vocabulary', () => {
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Room surface' })).toBeInTheDocument()

    const floor = screen.getByRole('button', { name: 'Floor' })
    const ceiling = screen.getByRole('button', { name: 'Ceiling' })

    for (const chip of [floor, ceiling]) {
      expect(chip).toHaveClass('ds-segmented__option')
      expect(chip).not.toHaveClass('finish-section__chip')
    }

    expect(floor).toHaveClass('is-active')
    expect(floor).toHaveAttribute('aria-pressed', 'true')
    expect(ceiling).not.toHaveClass('is-active')
  })

  it('switches the active surface when Ceiling is clicked', async () => {
    const user = userEvent.setup()
    render(
      <RoomFinishSection
        floorId="g"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ceiling' }))

    const ceiling = screen.getByRole('button', { name: 'Ceiling' })
    expect(ceiling).toHaveClass('is-active')
    expect(ceiling).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Floor' })).not.toHaveClass('is-active')
  })
})
