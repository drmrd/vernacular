import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PanelSlot } from './panel-slot'

afterEach(cleanup)

describe('PanelSlot', () => {
  it('renders a labeled region with its slot id', () => {
    render(
      <PanelSlot slotId="floor-switcher" label="Floors">
        <span>Switcher</span>
      </PanelSlot>,
    )
    const region = screen.getByRole('region', { name: 'Floors' })
    expect(region).toHaveAttribute('data-slot-id', 'floor-switcher')
  })

  it('renders its children when given', () => {
    render(
      <PanelSlot slotId="paint-pickers" label="Paint">
        <button>Pick color</button>
      </PanelSlot>,
    )
    expect(screen.getByRole('button', { name: 'Pick color' })).toBeInTheDocument()
  })

  it('renders an empty placeholder titled by the label when no children are given', () => {
    render(<PanelSlot slotId="paint-pickers" label="Paint" />)
    expect(screen.getByRole('heading', { name: 'Paint' })).toBeInTheDocument()
  })

  it('uses an explicit empty title and description when provided', () => {
    render(
      <PanelSlot
        slotId="paint-pickers"
        label="Paint"
        emptyTitle="No paint yet"
        emptyDescription="Pick a surface to paint it."
      />,
    )
    expect(screen.getByRole('heading', { name: 'No paint yet' })).toBeInTheDocument()
    expect(screen.getByText('Pick a surface to paint it.')).toBeInTheDocument()
  })

  it('exposes exactly one region landmark when empty (no nested duplicate)', () => {
    render(<PanelSlot slotId="paint-pickers" label="Paint" />)
    expect(screen.getAllByRole('region')).toHaveLength(1)
  })
})
