import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnitToggle } from './unit-toggle'

afterEach(cleanup)

describe('UnitToggle', () => {
  it('renders a Units radiogroup with Metric and Imperial options', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    const group = screen.getByRole('radiogroup', { name: 'Units' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('checks the Metric option when units is metric', () => {
    render(<UnitToggle units="metric" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Metric' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Imperial' })).not.toBeChecked()
  })

  it('checks the Imperial option when units is imperial', () => {
    render(<UnitToggle units="imperial" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Metric' })).not.toBeChecked()
  })

  it('reports an imperial change when the Imperial option is clicked from metric', async () => {
    const onChange = vi.fn()
    render(<UnitToggle units="metric" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('imperial')
  })

  it('reports a metric change when the Metric option is clicked from imperial', async () => {
    const onChange = vi.fn()
    render(<UnitToggle units="imperial" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Metric' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('metric')
  })
})
