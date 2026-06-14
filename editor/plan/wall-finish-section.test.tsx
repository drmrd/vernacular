import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WallFinishSection } from './wall-finish-section'

afterEach(cleanup)

describe('WallFinishSection', () => {
  it('renders Face A and Face B chips for the two wall sides', () => {
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
  })

  it('marks Face A active by default', () => {
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
  })
})
