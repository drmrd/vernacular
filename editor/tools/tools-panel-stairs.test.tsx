import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { OpeningToolProvider } from '../plan/opening-tool-context'
import { ToolsPanel } from './tools-panel'
import { renderPanelInProject } from './tools-panel-test-support'

afterEach(cleanup)

const GROUND_ELEVATION_MM = 0
const UPPER_ELEVATION_MM = 2700

// A stair spans two floors and a new project seeds one, so the chip has to say when
// there is nowhere for a stair to rise rather than arming a tool whose every click
// is turned down.
describe('ToolsPanel stairs availability', () => {
  it('marks Stairs unavailable and says what to do when nothing is above', () => {
    renderPanelInProject([GROUND_ELEVATION_MM], 0)

    const stairs = screen.getByRole('radio', { name: /stairs/i })
    expect(stairs).toHaveAttribute('aria-disabled', 'true')
    expect(stairs).toHaveAttribute('title', 'Add a floor above to place stairs')
  })

  it('offers Stairs once a floor sits above the one in hand', () => {
    renderPanelInProject([GROUND_ELEVATION_MM, UPPER_ELEVATION_MM], 0)

    const stairs = screen.getByRole('radio', { name: /stairs/i })
    expect(stairs).not.toHaveAttribute('aria-disabled')
    expect(stairs).not.toHaveAttribute('title')
  })

  it('does not arm the stair tool while the chip is unavailable', async () => {
    const user = userEvent.setup()
    renderPanelInProject([GROUND_ELEVATION_MM], 0)

    await user.click(screen.getByRole('radio', { name: /stairs/i }))

    expect(screen.getByRole('radio', { name: /stairs/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: /select/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('leaves Stairs available when the panel renders outside a project', () => {
    render(
      <ActiveToolProvider>
        <OpeningToolProvider>
          <ToolsPanel />
        </OpeningToolProvider>
      </ActiveToolProvider>,
    )

    expect(screen.getByRole('radio', { name: /stairs/i })).not.toHaveAttribute('aria-disabled')
  })
})
