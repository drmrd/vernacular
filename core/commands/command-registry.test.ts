import { describe, expect, it } from 'vitest'
import type { CommandHandler } from './command'
import { CommandRegistry } from './command-registry'

interface Box {
  value: number
}

describe('CommandRegistry', () => {
  it('returns the handler registered for a type', () => {
    const handler: CommandHandler<Box, number> = {
      apply(state, params) {
        state.value = params
      },
    }
    const registry = new CommandRegistry<Box>().register('set', handler)

    expect(registry.handlerFor('set')).toBe(handler)
  })

  it('returns undefined for an unregistered type', () => {
    expect(new CommandRegistry<Box>().handlerFor('missing')).toBeUndefined()
  })
})
