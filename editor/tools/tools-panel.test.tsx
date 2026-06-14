import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('renders four labeled rail sections', () => {
    const { container } = render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const labels = Array.from(container.querySelectorAll('.tools-panel__section-label')).map(
      (el) => el.textContent?.toLowerCase() ?? '',
    )

    expect(labels).toContain('select')
    expect(labels).toContain('draw')
    expect(labels).toContain('period')
    expect(labels).toContain('annotate')
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

  it('renders a Phosphor icon SVG inside the Select chip', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const selectChip = screen.getByRole('button', { name: /select/i })
    expect(selectChip.querySelector('svg')).not.toBeNull()
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

  it('renders Door and Window chips in the DRAW section (no standalone Opening chip)', () => {
    render(
      <ActiveToolProvider>
        <OpeningToolProvider>
          <ToolsPanel />
        </OpeningToolProvider>
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('button', { name: /door/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /window/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^opening$/i })).toBeNull()
  })

  it('pressing Door activates place-opening with a door type', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <OpeningToolProvider>
          <ToolsPanel />
        </OpeningToolProvider>
      </ActiveToolProvider>,
    )

    await user.click(screen.getByRole('button', { name: /door/i }))

    expect(screen.getByRole('button', { name: /door/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /window/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('pressing Window activates place-opening with a window type', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <OpeningToolProvider>
          <ToolsPanel />
        </OpeningToolProvider>
      </ActiveToolProvider>,
    )

    await user.click(screen.getByRole('button', { name: /window/i }))

    expect(screen.getByRole('button', { name: /window/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /door/i })).toHaveAttribute('aria-pressed', 'false')
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
