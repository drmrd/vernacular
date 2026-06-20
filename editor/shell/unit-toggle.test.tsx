import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnitToggle } from './unit-toggle'

afterEach(cleanup)

describe('UnitToggle', () => {
  it('routes Metric and Imperial through the segmented option vocabulary', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    const metric = screen.getByRole('button', { name: 'Metric' })
    const imperial = screen.getByRole('button', { name: 'Imperial' })
    expect(metric).toHaveClass('ds-segmented__option')
    expect(imperial).toHaveClass('ds-segmented__option')
  })

  it('exposes an accessible group named Units', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: /units/i })).toBeInTheDocument()
  })

  it('renders a visible Units label so the option pair reads as one labeled switch', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    expect(screen.getByText('Units', { selector: 'span' })).toBeInTheDocument()
  })

  it('marks the Metric option active when units is metric', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    const metric = screen.getByRole('button', { name: 'Metric' })
    const imperial = screen.getByRole('button', { name: 'Imperial' })
    expect(metric).toHaveClass('is-active')
    expect(metric).toHaveAttribute('aria-pressed', 'true')
    expect(imperial).not.toHaveClass('is-active')
    expect(imperial).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the Imperial option active when units is imperial', () => {
    render(<UnitToggle units="imperial" onChange={vi.fn()} />)

    const metric = screen.getByRole('button', { name: 'Metric' })
    const imperial = screen.getByRole('button', { name: 'Imperial' })
    expect(imperial).toHaveClass('is-active')
    expect(imperial).toHaveAttribute('aria-pressed', 'true')
    expect(metric).not.toHaveClass('is-active')
    expect(metric).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports an imperial change when the Imperial option is clicked from metric', async () => {
    const onChange = vi.fn()
    render(<UnitToggle units="metric" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Imperial' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('imperial')
  })

  it('reports a metric change when the Metric option is clicked from imperial', async () => {
    const onChange = vi.fn()
    render(<UnitToggle units="imperial" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Metric' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('metric')
  })
})
