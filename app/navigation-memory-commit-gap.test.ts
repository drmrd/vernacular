import { describe, expect, it, vi } from 'vitest'
import { settle } from '../session/autosave/save-gate-test-kit'
import { openOrThrow, workspaceRequest } from '../session/handle/handle-test-kit'
import { createMemoryAddressBar } from './address-bar'
import { FIRST_ID, SECOND_ID, addressOf, durablePortsWith } from './history-navigation-test-support'
import { afterRender, follow } from './follow-address'
import { newNavigationMemory, takeCommitted } from './navigation-memory'
import type { RunFlow } from './use-open-project'

/** A navigation open on the second project, whose address bar holds the first and the second. */
async function navigationAtTheSecondProject() {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
  const first = await openOrThrow(ports, workspaceRequest(FIRST_ID))
  const second = await openOrThrow(ports, workspaceRequest(SECOND_ID))
  const bar = createMemoryAddressBar(addressOf(FIRST_ID))
  bar.visit(addressOf(SECOND_ID))
  const flows: unknown[] = []
  // The move back ends at once with the first project; the move forward is still running.
  const runFlow: RunFlow = (flow) => {
    flows.push(flow)
    return flows.length === 1
      ? Promise.resolve({ ok: true, handle: first })
      : new Promise(() => undefined)
  }
  const view = { setPage: vi.fn(), setEntry: vi.fn(), bump: vi.fn() }
  const memory = newNavigationMemory(bar, view, { runFlow, retry: vi.fn() })
  memory.live = true
  memory.ports = ports
  memory.handle = second
  return { bar, flows, first, memory, ports }
}

describe('a history move made before the last move is committed', () => {
  it('opens the next project when the browser moves forward before the last move is committed', async () => {
    const { bar, flows, first, memory, ports } = await navigationAtTheSecondProject()
    bar.back()
    follow(memory)
    await settle()
    expect(flows).toHaveLength(1)

    bar.forward()
    follow(memory)
    expect(flows).toHaveLength(2)

    takeCommitted(memory, { ports, handle: first, failure: null })
    afterRender(memory)
    expect(bar.hash()).toBe(addressOf(SECOND_ID))
  })
})
