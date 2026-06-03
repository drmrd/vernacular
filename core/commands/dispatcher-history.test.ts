import { describe, expect, it } from 'vitest'
import type { Command, CommandHandler } from './command'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'

interface Counter {
  value: number
}

const setHandler: CommandHandler<Counter, { value: number }> = {
  apply(state, params) {
    state.value = params.value
  },
}

function counterRegistry(): CommandRegistry<Counter> {
  return new CommandRegistry<Counter>().register('set', setHandler).register('bump', setHandler)
}

function setValue(value: number): Command<{ value: number }> {
  return { type: 'set', params: { value }, description: `set ${value}` }
}

function bump(value: number): Command<{ value: number }> {
  return {
    type: 'bump',
    params: { value },
    description: `bump ${value}`,
    coalesceWith(previous) {
      return previous.type === 'bump' ? bump(value) : null
    },
  }
}

describe('Dispatcher coalescing', () => {
  it('merges a continuous gesture into a single undo entry', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(bump(1))
    dispatcher.dispatch(bump(2))
    dispatcher.dispatch(bump(3))
    expect(state.value).toBe(3)

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(dispatcher.undo()).toBe(false)
  })

  it('redoes a coalesced gesture to its final value', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(bump(1))
    dispatcher.dispatch(bump(2))
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(dispatcher.undo()).toBe(false)

    expect(dispatcher.redo()).toBe(true)
    expect(state.value).toBe(2)
  })

  it('does not coalesce across different command types', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(bump(2))

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(1)
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
  })

  it('drops the oldest entry past the history limit', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry(), { maxHistory: 2 })

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(setValue(2))
    dispatcher.dispatch(setValue(3))

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(2)
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(1)
    expect(dispatcher.undo()).toBe(false)
  })
})
