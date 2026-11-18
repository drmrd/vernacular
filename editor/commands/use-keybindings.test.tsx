import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useKeybindings } from './use-keybindings'
import { DiscardDialog } from '../shell/discard-dialog'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

function Probe({ commands, context }: { commands: EditorCommand[]; context: CommandContext }) {
  useKeybindings(commands, context)
  return (
    <>
      <input data-testid="field" />
      <button type="button" data-testid="control">
        Draw wall
      </button>
    </>
  )
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

  it('ignores an arrow key aimed at a focused button, which roves its own group', () => {
    const context = {} as CommandContext
    const run = vi.fn()
    const command: EditorCommand = {
      id: 'nudge',
      label: 'Nudge',
      keybindings: ['ArrowRight'],
      isEnabled: () => true,
      run,
    }
    render(<Probe commands={[command]} context={context} />)

    fireEvent.keyDown(screen.getByTestId('control'), { key: 'ArrowRight' })

    expect(run).not.toHaveBeenCalled()
  })

  it('still runs a shortcut a focused button does not own, such as Delete', () => {
    const context = {} as CommandContext
    const run = vi.fn()
    const command: EditorCommand = {
      id: 'delete-selection',
      label: 'Delete selection',
      keybindings: ['Delete'],
      isEnabled: () => true,
      run,
    }
    render(<Probe commands={[command]} context={context} />)

    fireEvent.keyDown(screen.getByTestId('control'), { key: 'Delete' })

    expect(run).toHaveBeenCalledTimes(1)
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

function bind(id: string, keybinding: string, run: () => void): EditorCommand {
  return { id, label: id, keybindings: [keybinding], isEnabled: () => true, run }
}

function openDiscardDialog() {
  return <DiscardDialog open projectName="Hubbard House" onConfirm={vi.fn()} onCancel={vi.fn()} />
}

function renderBehindDiscardDialog(commands: EditorCommand[]): HTMLElement {
  render(
    <>
      <Probe commands={commands} context={{} as CommandContext} />
      {openDiscardDialog()}
    </>,
  )
  return document.activeElement as HTMLElement
}

describe('useKeybindings and the browser default', () => {
  it('prevents the default of a bound save chord behind an open dialog and does not save', () => {
    const save = vi.fn()
    const cancel = renderBehindDiscardDialog([bind('save', 'Mod+S', save)])

    expect(fireEvent.keyDown(cancel, { key: 's', ctrlKey: true })).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('prevents the default of the bound palette chord behind an open dialog and does not run it', () => {
    const openPalette = vi.fn()
    const cancel = renderBehindDiscardDialog([bind('open-command-palette', 'Mod+K', openPalette)])

    expect(fireEvent.keyDown(cancel, { key: 'k', ctrlKey: true })).toBe(false)
    expect(openPalette).not.toHaveBeenCalled()
  })

  it('prevents the default of a bound chord with no dialog open and runs the command once', () => {
    const save = vi.fn()
    render(<Probe commands={[bind('save', 'Mod+S', save)]} context={{} as CommandContext} />)

    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('leaves the default of a chord nothing binds, with or without a dialog open', () => {
    const commands = [bind('save', 'Mod+S', vi.fn())]
    const { unmount } = render(<Probe commands={commands} context={{} as CommandContext} />)
    expect(fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true })).toBe(true)
    unmount()

    const cancel = renderBehindDiscardDialog(commands)

    expect(fireEvent.keyDown(cancel, { key: 'r', ctrlKey: true })).toBe(true)
  })

  it('leaves the default of a bound chord typed into a text field and does not run it', () => {
    const save = vi.fn()
    render(<Probe commands={[bind('save', 'Mod+S', save)]} context={{} as CommandContext} />)

    expect(fireEvent.keyDown(screen.getByTestId('field'), { key: 's', ctrlKey: true })).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('leaves the default of a chord whose command is not enabled', () => {
    const undo = vi.fn()
    const commands = [{ ...bind('undo', 'Mod+Z', undo), isEnabled: () => false }]
    render(<Probe commands={commands} context={{} as CommandContext} />)

    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(true)
    expect(undo).not.toHaveBeenCalled()
  })
})
