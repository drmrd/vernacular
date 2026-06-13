import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveToolProvider } from './active-tool-provider'
import { useActiveTool } from './active-tool-context'
import { ToolsPanel } from './tools-panel'

afterEach(cleanup)

describe('ToolsPanel', () => {
  it('defaults to the Select tool, lists it first, and describes its drag gestures', async () => {
    render(
      <ActiveToolProvider>
        <ToolsPanel />
      </ActiveToolProvider>,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName(/select/i)

    const selectButton = screen.getByRole('button', { name: /select/i })
    const drawButton = screen.getByRole('button', { name: /draw wall/i })
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    expect(drawButton).toHaveAttribute('aria-pressed', 'false')
    expect(selectButton).toHaveAttribute('title', expect.stringMatching(/pan/i))

    await userEvent.click(drawButton)
    expect(drawButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectButton).toHaveAttribute('aria-pressed', 'false')
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
