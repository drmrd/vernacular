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

  it('calls the PDF handler from its menu item', async () => {
    const user = userEvent.setup()
    const onExportPdf = vi.fn()
    render(<ExportMenu onExportPdf={onExportPdf} />)
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    await user.click(screen.getByRole('menuitem', { name: /pdf/i }))
    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })
})
