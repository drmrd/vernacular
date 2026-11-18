import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPaletteDialog } from './command-palette'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

const commands: EditorCommand[] = [
  { id: 'undo', label: 'Undo', keybindings: [], isEnabled: () => true, run: vi.fn() },
]

describe('the palette dialog and a click on its shade', () => {
  it('keeps focus in the search field after the shade is clicked, so Escape still closes', async () => {
    const onClose = vi.fn()
    render(
      <CommandPaletteDialog commands={commands} context={{} as CommandContext} onClose={onClose} />,
    )

    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(screen.getByRole('textbox', { name: 'Search commands' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })
})
