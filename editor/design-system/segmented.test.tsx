import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

  it('reports the previewed option value through onHover when an option is hovered', async () => {
    const onHover = vi.fn()
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} onHover={onHover} />)

    await userEvent.hover(screen.getByRole('button', { name: 'Elevation' }))

    expect(onHover).toHaveBeenCalledWith('elevation')
  })

  it('reports null through onHover when the pointer leaves the group', () => {
    const onHover = vi.fn()
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} onHover={onHover} />)

    fireEvent.mouseLeave(screen.getByRole('group'))

    expect(onHover).toHaveBeenCalledWith(null)
  })

  it('does not throw when an option is hovered without an onHover handler', async () => {
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} />)

    await expect(
      userEvent.hover(screen.getByRole('button', { name: 'Elevation' })),
    ).resolves.not.toThrow()
  })

  it('marks the previewValue option as previewed without pressing it', () => {
    render(
      <Segmented options={viewOptions} value="plan" previewValue="elevation" onSelect={() => {}} />,
    )

    const previewed = screen.getByRole('button', { name: 'Elevation' })
    expect(previewed).toHaveClass('is-preview')
    // The preview is a distinct, non-selecting state: it must not flip the pressed flag.
    expect(previewed).toHaveAttribute('aria-pressed', 'false')
    expect(previewed).not.toHaveClass('is-active')
  })

  it('does not mark any option previewed when previewValue is absent', () => {
    render(<Segmented options={viewOptions} value="plan" onSelect={() => {}} />)

    for (const name of ['Plan', 'Elevation', 'Perspective']) {
      expect(screen.getByRole('button', { name })).not.toHaveClass('is-preview')
    }
  })
})
