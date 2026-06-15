import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OverallDimensions } from './overall-dimensions'

afterEach(cleanup)

describe('OverallDimensions', () => {
  it('reads the width and height as one measurement value', () => {
    render(<OverallDimensions extent={{ width: '5 m', height: '3 m' }} />)
    expect(screen.getByText('5 m × 3 m')).toHaveClass('overall-dimensions__value')
  })

  it('labels the readout', () => {
    render(<OverallDimensions extent={{ width: '5 m', height: '3 m' }} />)
    expect(screen.getByText(/overall/i)).toHaveClass('overall-dimensions__label')
  })

  it('renders nothing when there is no extent', () => {
    const { container } = render(<OverallDimensions extent={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
