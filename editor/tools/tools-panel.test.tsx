import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

function renderPanel() {
  return render(
    <ActiveToolProvider>
      <OpeningToolProvider>
        <ToolsPanel />
      </OpeningToolProvider>
    </ActiveToolProvider>,
  )
}

describe('ToolsPanel', () => {
  it('renders four rail section labels through the SectionLabel primitive', () => {
    const { container } = renderPanel()

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

  it('groups all tool chips inside a single Tools radiogroup', () => {
    renderPanel()

    const group = screen.getByRole('radiogroup', { name: /tools/i })
    for (const name of [/^select$/i, /^wall$/i, /^door$/i, /^window$/i, /^dimension$/i]) {
      expect(within(group).getByRole('radio', { name })).toBeInTheDocument()
    }
  })

  it('offers no Pan chip, because panning is a plain drag under Select', () => {
    renderPanel()

    expect(screen.queryByRole('radio', { name: /^pan$/i })).toBeNull()
  })

  it('defaults to the Select tool checked', () => {
    renderPanel()

    expect(screen.getByRole('radio', { name: /select/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /wall/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('marks the active tool chip checked and all others unchecked', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('radio', { name: /wall/i }))

    expect(screen.getByRole('radio', { name: /wall/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /select/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('renders a Phosphor icon SVG inside the Select chip', () => {
    renderPanel()

    const selectChip = screen.getByRole('radio', { name: /select/i })
    expect(selectChip.querySelector('svg')).not.toBeNull()
  })

  it('routes tool chips through the shared segmented option treatment', () => {
    renderPanel()

    for (const name of [/select/i, /wall/i, /dimension/i]) {
      expect(screen.getByRole('radio', { name })).toHaveClass('ds-segmented__option')
    }
  })

  it('marks the active tool chip with the shared is-active treatment and moves it on activation', async () => {
    const user = userEvent.setup()
    renderPanel()

    const selectChip = screen.getByRole('radio', { name: /select/i })
    const wallChip = screen.getByRole('radio', { name: /wall/i })

    expect(selectChip).toHaveClass('is-active')
    expect(selectChip).toHaveAttribute('aria-checked', 'true')
    expect(wallChip).not.toHaveClass('is-active')

    await user.click(wallChip)

    expect(wallChip).toHaveClass('is-active')
    expect(wallChip).toHaveAttribute('aria-checked', 'true')
    expect(selectChip).not.toHaveClass('is-active')
    expect(selectChip).toHaveAttribute('aria-checked', 'false')
  })

  it('exposes planned placeholder chips as disabled radios on the shared treatment', () => {
    renderPanel()

    const fireplaceChip = screen.getByRole('radio', { name: /fireplace/i })

    expect(fireplaceChip).toHaveAttribute('aria-disabled', 'true')
    expect(fireplaceChip).toHaveAttribute('aria-checked', 'false')
    expect(fireplaceChip).toBeEnabled()
    expect(fireplaceChip).toHaveClass('ds-segmented__option')
  })

  it('planned tools stay perceivable and read as planned', async () => {
    const user = userEvent.setup()
    renderPanel()

    const selectChip = screen.getByRole('radio', { name: /select/i })

    for (const name of [/fireplace/i, /chimney/i, /label/i]) {
      const chip = screen.getByRole('radio', { name })

      expect(chip).toHaveAttribute('aria-disabled', 'true')
      expect(chip).toBeEnabled()
      expect(chip).toHaveAttribute('title', expect.stringMatching(/planned/i))
      expect(chip).toHaveClass('tools-panel__chip')
    }

    const fireplaceChip = screen.getByRole('radio', { name: /fireplace/i })

    expect(selectChip).toHaveAttribute('aria-checked', 'true')

    await user.click(fireplaceChip)

    expect(selectChip).toHaveAttribute('aria-checked', 'true')
    expect(fireplaceChip).not.toHaveAttribute('aria-checked', 'true')
  })

  it('renders Door and Window chips in the DRAW section (no standalone Opening chip)', () => {
    renderPanel()

    expect(screen.getByRole('radio', { name: /door/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /window/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^opening$/i })).toBeNull()
  })

  it('pressing Door activates place-opening with a door type', async () => {
    const user = userEvent.setup()
    renderPanel()

    const doorChip = screen.getByRole('radio', { name: /door/i })
    expect(doorChip).toHaveClass('ds-segmented__option')

    await user.click(doorChip)

    expect(doorChip).toHaveAttribute('aria-checked', 'true')
    expect(doorChip).toHaveClass('is-active')
    expect(screen.getByRole('radio', { name: /window/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('pressing Window activates place-opening with a window type', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('radio', { name: /window/i }))

    expect(screen.getByRole('radio', { name: /window/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /door/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('pressing Stairs activates the place-stair tool', async () => {
    const user = userEvent.setup()
    renderPanel()

    const stairsChip = screen.getByRole('radio', { name: /stairs/i })
    expect(stairsChip).toHaveClass('ds-segmented__option')

    await user.click(stairsChip)

    expect(stairsChip).toHaveAttribute('aria-checked', 'true')
    expect(stairsChip).toHaveClass('is-active')
  })
})

describe('ToolsPanel keyboard navigation', () => {
  it('keeps only the checked tool in the tab order (roving tabindex)', () => {
    renderPanel()

    expect(screen.getByRole('radio', { name: /select/i })).toHaveAttribute('tabindex', '0')
    for (const name of [/wall/i, /door/i, /window/i, /dimension/i, /fireplace/i]) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('tabindex', '-1')
    }
  })

  it('moves selection and focus to the next tool on ArrowDown', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /select/i }).focus()
    await user.keyboard('{ArrowDown}')

    const wall = screen.getByRole('radio', { name: /wall/i })
    expect(wall).toHaveFocus()
    expect(wall).toHaveAttribute('aria-checked', 'true')
    expect(wall).toHaveAttribute('tabindex', '0')
  })

  it('steps over the disabled planned chips when roving', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /window/i }).focus()
    await user.keyboard('{ArrowDown}')

    const stairs = screen.getByRole('radio', { name: /stairs/i })
    expect(stairs).toHaveFocus()
    expect(stairs).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /fireplace/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('wraps to the last enabled tool when moving before the first on ArrowUp', async () => {
    const user = userEvent.setup()
    renderPanel()

    screen.getByRole('radio', { name: /select/i }).focus()
    await user.keyboard('{ArrowUp}')

    expect(screen.getByRole('radio', { name: /dimension/i })).toHaveFocus()
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
