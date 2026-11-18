import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPaletteDialog } from './command-palette'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

const context = {} as CommandContext

// Older engines report a key of a composition as key code 229 instead of isComposing.
const COMPOSITION_KEY_CODE = 229

// The user-event library does not model input-method composition, so the keys of a
// composition are fired as raw keydown events with the init that a browser sends.
function renderPalette() {
  const runFirst = vi.fn()
  const runSecond = vi.fn()
  const onClose = vi.fn()
  const commands: EditorCommand[] = [
    { id: 'first', label: 'First', keybindings: [], isEnabled: () => true, run: runFirst },
    { id: 'second', label: 'Second', keybindings: [], isEnabled: () => true, run: runSecond },
  ]
  render(<CommandPaletteDialog commands={commands} context={context} onClose={onClose} />)
  const field = screen.getByRole('textbox', { name: 'Search commands' })
  field.focus()
  return { field, runFirst, runSecond, onClose }
}

describe('a key of a text composition in the palette search field', () => {
  it('runs no command and does not close on an Enter marked as composing', () => {
    const { field, runFirst, onClose } = renderPalette()

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })

    expect(runFirst).toHaveBeenCalledTimes(0)
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('runs no command and does not close on an Enter with the legacy composition key code', () => {
    const { field, runFirst, onClose } = renderPalette()

    fireEvent.keyDown(field, { key: 'Enter', keyCode: COMPOSITION_KEY_CODE })

    expect(runFirst).toHaveBeenCalledTimes(0)
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('does not close on an Escape marked as composing', () => {
    const { field, onClose } = renderPalette()

    fireEvent.keyDown(field, { key: 'Escape', isComposing: true })

    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('leaves the next plain Enter to run the first command once and close once', async () => {
    const { field, runFirst, onClose } = renderPalette()

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    await userEvent.keyboard('{Enter}')

    expect(runFirst).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('a plain Escape in the palette search field', () => {
  it('closes the palette once', async () => {
    const { onClose } = renderPalette()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
