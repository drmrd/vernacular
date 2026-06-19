import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPaletteDialog } from './command-palette'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

const context = {} as CommandContext
const runUndo = vi.fn()
const runRedo = vi.fn()

function buildCommands(): EditorCommand[] {
  return [
    { id: 'undo', label: 'Undo', keybindings: [], isEnabled: () => true, run: runUndo },
    { id: 'redo', label: 'Redo', keybindings: [], isEnabled: () => true, run: runRedo },
    {
      id: 'delete',
      label: 'Delete selection',
      keybindings: [],
      isEnabled: () => false,
      run: vi.fn(),
    },
  ]
}

function renderDialog(onClose: () => void) {
  render(<CommandPaletteDialog commands={buildCommands()} context={context} onClose={onClose} />)
}

describe('CommandPaletteDialog', () => {
  it('lists only the enabled commands', () => {
    renderDialog(vi.fn())

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Undo')).toBeInTheDocument()
    expect(screen.getByText('Redo')).toBeInTheDocument()
    expect(screen.queryByText('Delete selection')).toBeNull()
  })

  it('filters the commands by the typed query', async () => {
    renderDialog(vi.fn())

    await userEvent.type(screen.getByRole('textbox'), 'red')

    expect(screen.getByText('Redo')).toBeInTheDocument()
    expect(screen.queryByText('Undo')).toBeNull()
  })

  it('runs the first filtered command on Enter and closes', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    await userEvent.type(screen.getByRole('textbox'), 'red')
    await userEvent.keyboard('{Enter}')

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs a command when clicked and closes', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    await userEvent.click(screen.getByText('Undo'))

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders each command row through the design-system Button primitive and still runs it on click', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    const undoRow = screen.getByRole('button', { name: 'Undo' })
    const redoRow = screen.getByRole('button', { name: 'Redo' })

    expect(undoRow).toHaveClass('ds-button')
    expect(redoRow).toHaveClass('ds-button')

    await userEvent.click(undoRow)

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    renderDialog(onClose)

    screen.getByRole('textbox').focus()
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('focuses the search input on open and restores focus to the opener on Escape', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open palette'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    try {
      const onClose = vi.fn()
      renderDialog(onClose)

      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Search commands' }),
      )

      await userEvent.keyboard('{Escape}')

      expect(onClose).toHaveBeenCalled()
      expect(document.activeElement).toBe(opener)
    } finally {
      opener.remove()
    }
  })

  it('exposes the open palette as a named modal dialog', () => {
    renderDialog(vi.fn())

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })

    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('labels the search input for assistive tech', () => {
    renderDialog(vi.fn())

    expect(screen.getByRole('textbox', { name: 'Search commands' })).toBeInTheDocument()
  })

  it('does not leak handled keystrokes to the window', () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)

    try {
      renderDialog(vi.fn())

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

      expect(onWindowKeyDown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  })
})
