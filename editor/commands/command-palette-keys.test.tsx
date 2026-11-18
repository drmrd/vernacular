import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPaletteDialog } from './command-palette'
import type { CommandContext, EditorCommand } from './command'

afterEach(cleanup)

const commands: EditorCommand[] = [
  { id: 'undo', label: 'Undo', keybindings: [], isEnabled: () => true, run: vi.fn() },
]

describe('the palette dialog and the keys behind it', () => {
  it('keeps the keys typed into the search field away from the window', async () => {
    const onWindowKeyDown = vi.fn()
    window.addEventListener('keydown', onWindowKeyDown)

    try {
      render(
        <CommandPaletteDialog
          commands={commands}
          context={{} as CommandContext}
          onClose={vi.fn()}
        />,
      )
      const search = screen.getByRole('textbox', { name: 'Search commands' })

      await userEvent.type(search, 'w')

      expect(search).toHaveValue('w')
      expect(onWindowKeyDown).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  })
})
