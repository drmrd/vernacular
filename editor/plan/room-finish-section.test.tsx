import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
})
