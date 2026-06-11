import { describe, it, expect, vi } from 'vitest'
import { createViewCommands } from './view-commands'
import type { CommandContext } from './command'
import type { ViewControls } from '../viewport/view-mode'

function buildView(): ViewControls {
  return { mode: 'plan', setMode: vi.fn() }
}

describe('createViewCommands', () => {
  it('registers the three view-mode commands with number keybindings', () => {
    const commands = createViewCommands(buildView())
    const byId = (id: string) => commands.find((command) => command.id === id)

    const plan = byId('show-plan')
    const split = byId('show-split')
    const threeD = byId('show-3d')

    expect(plan).toBeDefined()
    expect(split).toBeDefined()
    expect(threeD).toBeDefined()

    expect(plan?.label).toBe('Plan view')
    expect(plan?.keybindings).toEqual(['1'])
    expect(split?.label).toBe('Split view')
    expect(split?.keybindings).toEqual(['2'])
    expect(threeD?.label).toBe('3D view')
    expect(threeD?.keybindings).toEqual(['3'])
  })

  it('switches the mode when run', () => {
    const view = buildView()
    const commands = createViewCommands(view)
    const byId = (id: string) => commands.find((command) => command.id === id)
    const context = {} as CommandContext

    byId('show-plan')?.run(context)
    expect(view.setMode).toHaveBeenNthCalledWith(1, 'plan')

    byId('show-split')?.run(context)
    expect(view.setMode).toHaveBeenNthCalledWith(2, 'split')

    byId('show-3d')?.run(context)
    expect(view.setMode).toHaveBeenNthCalledWith(3, 'preview')
  })

  it('is always enabled', () => {
    const commands = createViewCommands(buildView())
    const context = {} as CommandContext

    for (const command of commands) {
      expect(command.isEnabled(context)).toBe(true)
    }
  })
})
