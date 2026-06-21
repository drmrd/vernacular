import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportMenu } from './export-menu'

afterEach(cleanup)

describe('ExportMenu', () => {
  it('renders nothing when no export handlers are provided', () => {
    const { container } = render(<ExportMenu />)
    expect(container.firstChild).toBeNull()
  })

  it('exposes a primary Export trigger when at least one handler is provided', () => {
    render(<ExportMenu onExportBundle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^export$/i })).toHaveClass('ds-button--primary')
  })

  it('opens the menu and calls the bundle handler from its item', async () => {
    const user = userEvent.setup()
    const onExportBundle = vi.fn()
    render(
      <ExportMenu
        onExportBundle={onExportBundle}
        onExportPlan={vi.fn()}
        onExportImage={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    await user.click(screen.getByRole('menuitem', { name: /bundle/i }))
    expect(onExportBundle).toHaveBeenCalledTimes(1)
  })

  it('routes the export items through the design-system Button while preserving menu semantics', async () => {
    const user = userEvent.setup()
    const onExportBundle = vi.fn()
    render(
      <ExportMenu
        onExportBundle={onExportBundle}
        onExportPlan={vi.fn()}
        onExportImage={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /^export$/i })
    expect(trigger).toHaveClass('ds-button')

    await user.click(trigger)

    const item = screen.getByRole('menuitem', { name: /bundle/i })
    expect(item).toHaveClass('ds-button')
    expect(item).not.toHaveClass('export-menu__item')

    await user.click(item)
    expect(onExportBundle).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('describes each export option and names the bundle extension', async () => {
    const user = userEvent.setup()
    render(
      <ExportMenu
        onExportBundle={vi.fn()}
        onExportPlan={vi.fn()}
        onExportImage={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^export$/i }))

    expect(screen.getByText(/Project bundle \(\.building\)/)).toBeInTheDocument()
    expect(screen.getByText('A full, re-openable copy of your project.')).toBeInTheDocument()
    expect(screen.getByText('A vector drawing of the plan.')).toBeInTheDocument()
    expect(screen.getByText('A flat image of the plan.')).toBeInTheDocument()
    expect(screen.getByText('For printing to scale.')).toBeInTheDocument()
  })

  it('calls the PDF handler from its menu item', async () => {
    const user = userEvent.setup()
    const onExportPdf = vi.fn()
    render(<ExportMenu onExportPdf={onExportPdf} />)
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    await user.click(screen.getByRole('menuitem', { name: /pdf/i }))
    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })

  it('closes the open menu and returns focus to the trigger when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(
      <ExportMenu
        onExportBundle={vi.fn()}
        onExportPlan={vi.fn()}
        onExportImage={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: /^export$/i })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
