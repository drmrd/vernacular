import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useKeybindings } from './use-keybindings'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

function Probe({ commands, context }: { commands: EditorCommand[]; context: CommandContext }) {
  useKeybindings(commands, context)
  return <input data-testid="field" />
}

describe('useKeybindings', () => {
  it('runs the matching enabled command on a keydown', () => {
    const context = {} as CommandContext
    const run = vi.fn()
    const command: EditorCommand = {
      id: 'palette',
      label: 'Palette',
      keybindings: ['Mod+K'],
      isEnabled: () => true,
      run,
    }
    render(<Probe commands={[command]} context={context} />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('ignores keystrokes typed into a form field', () => {
    const context = {} as CommandContext
    const run = vi.fn()
    const command: EditorCommand = {
      id: 'palette',
      label: 'Palette',
      keybindings: ['Mod+K'],
      isEnabled: () => true,
      run,
    }
    render(<Probe commands={[command]} context={context} />)

    fireEvent.keyDown(screen.getByTestId('field'), { key: 'k', ctrlKey: true })

    expect(run).not.toHaveBeenCalled()
  })

  it('does nothing when no command matches', () => {
    const context = {} as CommandContext
    const run = vi.fn()
    const command: EditorCommand = {
      id: 'palette',
      label: 'Palette',
      keybindings: ['Mod+K'],
      isEnabled: () => true,
      run,
    }
    render(<Probe commands={[command]} context={context} />)

    fireEvent.keyDown(window, { key: 'q', ctrlKey: true })

    expect(run).not.toHaveBeenCalled()
  })
})
