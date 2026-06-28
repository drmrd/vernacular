import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Compass } from './compass'

afterEach(cleanup)

describe('Compass', () => {
  it('renders an accessible image named for the north it marks', () => {
    render(<Compass />)

    expect(screen.getByRole('img', { name: /north/i })).toBeInTheDocument()
  })

  it('labels the needle with a north marker', () => {
    render(<Compass />)

    expect(screen.getByText('N')).toBeInTheDocument()
  })

  it('points the needle straight up when no bearing is set', () => {
    const { container } = render(<Compass />)

    expect(container.querySelector('g')?.getAttribute('transform')).toBeNull()
  })

  it('rotates the needle to indicate the site north bearing', () => {
    const { container } = render(<Compass northBearing={Math.PI / 2} />)

    expect(container.querySelector('g')?.getAttribute('transform')).toBe('rotate(-90 12 18)')
  })
})
