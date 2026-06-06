import { describe, expect, it } from 'vitest'
import type { Command, CommandHandler } from './command'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'

interface Counter {
  value: number
}

function setValue(value: number): Command<{ value: number }> {
  return { type: 'set', params: { value }, description: `set ${value}` }
}

function counterRegistry(): CommandRegistry<Counter> {
  const handler: CommandHandler<Counter, { value: number }> = {
    apply(state, params) {
      state.value = params.value
    },
  }
  return new CommandRegistry<Counter>().register('set', handler)
}

describe('Dispatcher', () => {
  it('applies a command to the state', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(5))

    expect(state.value).toBe(5)
  })

  it('undoes and redoes the last command', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(5))
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(dispatcher.redo()).toBe(true)
    expect(state.value).toBe(5)
  })

  it('reports false when there is nothing to undo or redo', () => {
    const dispatcher = new Dispatcher<Counter>({ value: 0 }, counterRegistry())

    expect(dispatcher.undo()).toBe(false)
    expect(dispatcher.redo()).toBe(false)
  })

  it('canRedo reflects whether an undone command can be redone', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    expect(dispatcher.canRedo()).toBe(false)

    dispatcher.dispatch(setValue(5))
    dispatcher.undo()
    expect(dispatcher.canRedo()).toBe(true)

    dispatcher.redo()
    expect(dispatcher.canRedo()).toBe(false)
  })

  it('discards the redo branch after a new command', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(setValue(2))
    dispatcher.undo()
    dispatcher.dispatch(setValue(9))

    expect(dispatcher.redo()).toBe(false)
    expect(state.value).toBe(9)
  })

  it('rolls back and leaves history untouched when a handler throws', () => {
    const state: Counter = { value: 7 }
    const registry = new CommandRegistry<Counter>().register('boom', {
      apply(current) {
        current.value = -1
        throw new Error('handler exploded')
      },
    })
    const dispatcher = new Dispatcher(state, registry)

    expect(() =>
      dispatcher.dispatch({ type: 'boom', params: undefined, description: 'boom' }),
    ).toThrow('rolled back')
    expect(state.value).toBe(7)
    expect(dispatcher.canUndo()).toBe(false)
  })

  it('throws when dispatching an unregistered command type', () => {
    const dispatcher = new Dispatcher<Counter>({ value: 0 }, new CommandRegistry<Counter>())

    expect(() => dispatcher.dispatch(setValue(1))).toThrow('No handler')
  })
})
