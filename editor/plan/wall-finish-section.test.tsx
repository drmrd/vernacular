import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders the Finish label through the SectionLabel primitive', () => {
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )
    const label = screen.getByText(/finish/i)
    expect(label).toHaveClass('ds-section-label')
    expect(label).not.toHaveClass('finish-section__label')
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

  it('routes the face chips through the design-system Segmented option vocabulary', () => {
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Wall face' })).toBeInTheDocument()

    const faceA = screen.getByRole('button', { name: 'A' })
    const faceB = screen.getByRole('button', { name: 'B' })

    for (const chip of [faceA, faceB]) {
      expect(chip).toHaveClass('ds-segmented__option')
      expect(chip).not.toHaveClass('finish-section__chip')
    }

    expect(faceA).toHaveClass('is-active')
    expect(faceA).toHaveAttribute('aria-pressed', 'true')
    expect(faceB).not.toHaveClass('is-active')
  })

  it('explains that A and B are the two paintable wall faces', () => {
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByText(/two paintable faces/i)).toBeInTheDocument()
  })

  it('switches the active face when Face B is clicked', async () => {
    const user = userEvent.setup()
    render(
      <WallFinishSection
        wallId="w1"
        treatmentFor={() => undefined}
        recent={[]}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'B' }))

    const faceB = screen.getByRole('button', { name: 'B' })
    expect(faceB).toHaveClass('is-active')
    expect(faceB).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'A' })).not.toHaveClass('is-active')
  })
})
