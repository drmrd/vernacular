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
})
