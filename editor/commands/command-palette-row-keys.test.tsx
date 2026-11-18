import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPaletteDialog } from './command-palette'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

const context = {} as CommandContext

function renderPalette() {
  const runUndo = vi.fn()
  const runRedo = vi.fn()
  const onClose = vi.fn()
  const commands: EditorCommand[] = [
    { id: 'undo', label: 'Undo', keybindings: [], isEnabled: () => true, run: runUndo },
    { id: 'redo', label: 'Redo', keybindings: [], isEnabled: () => true, run: runRedo },
  ]
  render(<CommandPaletteDialog commands={commands} context={context} onClose={onClose} />)
  return { runUndo, runRedo, onClose }
}

async function focusRowByTab(label: string, tabs: number) {
  await userEvent.click(screen.getByRole('textbox', { name: 'Search commands' }))
  for (let pressed = 0; pressed < tabs; pressed += 1) {
    await userEvent.tab()
  }
  expect(screen.getByRole('button', { name: label })).toHaveFocus()
}

describe('a key pressed on a focused palette row', () => {
  it('runs only the command of the second row on Enter and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()
    await focusRowByTab('Redo', 2)

    await userEvent.keyboard('{Enter}')

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(runUndo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs only the command of the second row on Space and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()
    await focusRowByTab('Redo', 2)

    await userEvent.keyboard(' ')

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(runUndo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs the command of the first row once, not twice, on Enter and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()
    await focusRowByTab('Undo', 1)

    await userEvent.keyboard('{Enter}')

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(runRedo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs the only listed command from its focused row on Enter and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()
    await userEvent.type(screen.getByRole('textbox', { name: 'Search commands' }), 'red')
    await focusRowByTab('Redo', 1)

    await userEvent.keyboard('{Enter}')

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(runUndo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('the other ways to run a palette command', () => {
  it('runs the first filtered command on Enter in the search field and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()

    await userEvent.click(screen.getByRole('textbox', { name: 'Search commands' }))
    await userEvent.keyboard('{Enter}')

    expect(runUndo).toHaveBeenCalledTimes(1)
    expect(runRedo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs only the command of the second row when it is clicked and closes once', async () => {
    const { runUndo, runRedo, onClose } = renderPalette()

    await userEvent.click(screen.getByRole('button', { name: 'Redo' }))

    expect(runRedo).toHaveBeenCalledTimes(1)
    expect(runUndo).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
