import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from './index'

afterEach(cleanup)

const viewOptions = [
  { value: 'plan', label: 'Plan' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'perspective', label: 'Perspective' },
]

describe('Segmented', () => {
  it('renders each option as a button', () => {
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elevation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Perspective' })).toBeInTheDocument()
  })

  it('marks the selected option as pressed and the others as not pressed', () => {
    render(<Segmented options={viewOptions} value="elevation" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Elevation' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Perspective' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('gives only the selected option the single canonical active class', () => {
    render(<Segmented options={viewOptions} value="elevation" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Elevation' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Plan' })).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Perspective' })).not.toHaveClass('is-active')
  })

  it('fires onSelect with the option value when an option is clicked', async () => {
    const onSelect = vi.fn()
    render(<Segmented options={viewOptions} value="plan" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Perspective' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('perspective')
  })

  it('keeps every option keyboard reachable as a focusable button', async () => {
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Elevation' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Perspective' })).toHaveFocus()
  })
})
