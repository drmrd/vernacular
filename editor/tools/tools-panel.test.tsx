import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('renders four rail section labels through the SectionLabel primitive', () => {
    const { container } = render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const sectionLabels = Array.from(container.querySelectorAll('.ds-section-label'))
    const labels = sectionLabels.map((el) => el.textContent?.toLowerCase() ?? '')

    expect(labels).toContain('select')
    expect(labels).toContain('draw')
    expect(labels).toContain('period')
    expect(labels).toContain('annotate')

    for (const el of sectionLabels) {
      expect(el).not.toHaveClass('tools-panel__section-label')
    }
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

  it('routes tool chips through the shared segmented option treatment', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    for (const name of [/select/i, /pan/i, /wall/i, /dimension/i]) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-segmented__option')
    }
  })

  it('marks the active tool chip with the shared is-active treatment and moves it on activation', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const selectChip = screen.getByRole('button', { name: /select/i })
    const panChip = screen.getByRole('button', { name: /pan/i })

    expect(selectChip).toHaveClass('is-active')
    expect(selectChip).toHaveAttribute('aria-pressed', 'true')
    expect(panChip).not.toHaveClass('is-active')

    await user.click(panChip)

    expect(panChip).toHaveClass('is-active')
    expect(panChip).toHaveAttribute('aria-pressed', 'true')
    expect(selectChip).not.toHaveClass('is-active')
    expect(selectChip).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps planned placeholder chips on the shared segmented option treatment', () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const fireplaceChip = screen.getByRole('button', { name: /fireplace/i })

    expect(fireplaceChip).toHaveAttribute('aria-disabled', 'true')
    expect(fireplaceChip).toBeEnabled()
    expect(fireplaceChip).toHaveClass('ds-segmented__option')
  })

  it('planned tools stay perceivable and read as planned', async () => {
    const user = userEvent.setup()
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const selectChip = screen.getByRole('button', { name: /select/i })

    for (const name of [/fireplace/i, /chimney/i, /stairs/i, /label/i]) {
      const chip = screen.getByRole('button', { name })

      expect(chip).toHaveAttribute('aria-disabled', 'true')
      expect(chip).toBeEnabled()
      expect(chip).toHaveAttribute('title', expect.stringMatching(/planned/i))
      expect(chip).toHaveClass('tools-panel__chip')
    }

    const fireplaceChip = screen.getByRole('button', { name: /fireplace/i })

    expect(selectChip).toHaveAttribute('aria-pressed', 'true')

    await user.click(fireplaceChip)

    expect(selectChip).toHaveAttribute('aria-pressed', 'true')
    expect(fireplaceChip).not.toHaveAttribute('aria-pressed', 'true')
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

    const doorChip = screen.getByRole('button', { name: /door/i })
    expect(doorChip).toHaveClass('ds-segmented__option')

    await user.click(doorChip)

    expect(doorChip).toHaveAttribute('aria-pressed', 'true')
    expect(doorChip).toHaveClass('is-active')
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
