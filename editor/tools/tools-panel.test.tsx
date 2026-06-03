import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('marks the default draw-wall tool active and switches on click', async () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const drawButton = screen.getByRole('button', { name: /draw wall/i })
    const selectButton = screen.getByRole('button', { name: /select/i })
    expect(drawButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectButton).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(selectButton)

    expect(drawButton).toHaveAttribute('aria-pressed', 'false')
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
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
