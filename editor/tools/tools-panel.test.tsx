import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('renders four labeled rail sections', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByText(/^select$/i)).toBeInTheDocument()
    expect(screen.getByText(/^draw$/i)).toBeInTheDocument()
    expect(screen.getByText(/^period$/i)).toBeInTheDocument()
    expect(screen.getByText(/^annotate$/i)).toBeInTheDocument()
  })

  it('includes a Pan chip in the SELECT section', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('button', { name: /pan/i })).toBeInTheDocument()
  })

  it('defaults to the Select tool active', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /pan/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the active tool chip pressed and all others unpressed', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    await user.click(screen.getByRole('button', { name: /pan/i }))

    expect(screen.getByRole('button', { name: /pan/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies the surface-active class to the pressed chip, not the accent-strong class', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const selectChip = screen.getByRole('button', { name: /select/i })

    expect(selectChip).toHaveClass('tools-panel__chip--active')
    expect(selectChip).not.toHaveClass('tools-panel__chip--accent')

    await user.click(screen.getByRole('button', { name: /pan/i }))

    expect(selectChip).not.toHaveClass('tools-panel__chip--active')
  })
})

describe('useActiveTool', () => {
  it('throws when used outside an ActiveToolProvider', () => {
    function Orphan() {
      useActiveTool()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/ActiveToolProvider/)
  })
})
