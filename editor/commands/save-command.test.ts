import { describe, it, expect, vi } from 'vitest'
import { createSaveCommand } from './save-command'
import type { CommandContext } from './command'

describe('createSaveCommand', () => {
  it('binds the save action to Mod+S', () => {
    const command = createSaveCommand(vi.fn())

    expect(command.id).toBe('save')
    expect(command.label).toBe('Save')
    expect(command.keybindings).toEqual(['Mod+S'])
  })

  it('invokes the save callback when run', () => {
    const onSave = vi.fn()
    const command = createSaveCommand(onSave)
    const context = {} as CommandContext

    command.run(context)

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('is always enabled', () => {
    const command = createSaveCommand(vi.fn())
    const context = {} as CommandContext

    expect(command.isEnabled(context)).toBe(true)
  })
})
