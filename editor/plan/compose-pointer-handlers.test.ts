import type { PointerEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { composePointerHandlers, type PointerSources } from './compose-pointer-handlers'

// Every handler group is an inert stand-in: any method on it is a spy that
// reports "not handled", so a press or move falls through the whole chain.
function inertGroup(): unknown {
  return new Proxy({}, { get: () => vi.fn() })
}

function sourcesWith(clearAuthoringAnnouncement: () => void): PointerSources {
  const groups = new Proxy(
    { clearAuthoringAnnouncement },
    { get: (target, key) => (key in target ? Reflect.get(target, key) : inertGroup()) },
  )
  return groups as unknown as PointerSources
}

const event = {} as PointerEvent<HTMLCanvasElement>

describe('composePointerHandlers', () => {
  it('clears the keyboard authoring announcement on a pointer move', () => {
    const clear = vi.fn()
    composePointerHandlers(sourcesWith(clear)).onPointerMove(event)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('clears the keyboard authoring announcement on a pointer down', () => {
    const clear = vi.fn()
    composePointerHandlers(sourcesWith(clear)).onPointerDown(event)
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
