import { describe, expect, it, vi } from 'vitest'
import { settle } from '../session/autosave/save-gate-test-kit'
import { openOrThrow, workspaceRequest } from '../session/handle/handle-test-kit'
import { createMemoryAddressBar } from './address-bar'
import {
  FIRST_ID,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  switchTo,
} from './history-navigation-test-support'
import { afterRender, follow } from './follow-address'
import { retryNotice, runFlowOf } from './navigation-actions'
import { newNavigationMemory, takeCommitted } from './navigation-memory'
import type { Flow, RunFlow } from './use-open-project'

/** A navigation open on the second project, whose address bar holds the first and the second. */
async function navigationAtTheSecondProject() {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
  const first = await openOrThrow(ports, workspaceRequest(FIRST_ID))
  const second = await openOrThrow(ports, workspaceRequest(SECOND_ID))
  const bar = createMemoryAddressBar(addressOf(FIRST_ID))
  bar.visit(addressOf(SECOND_ID))
  const flows: Flow<unknown>[] = []
  // The move back replaces the second project with the first at once; the move forward is still
  // running.
  const runFlow: RunFlow = (flow) => {
    flows.push(flow)
    return flows.length === 1
      ? second.close().then(() => ({ ok: true, handle: first }))
      : new Promise(() => undefined)
  }
  const view = { setPage: vi.fn(), setEntry: vi.fn(), bump: vi.fn() }
  const memory = newNavigationMemory(bar, view, {
    runFlow,
    runAction: () => Promise.resolve(undefined),
    retry: vi.fn(),
  })
  memory.live = true
  takeCommitted(memory, { ports, handle: second, failure: null })
  return { bar, flows, first, memory, ports }
}

describe('a history move made before the last move is committed', () => {
  it('hands the next project to the owner and keeps its address when the browser moves forward before the last move is committed', async () => {
    const { bar, flows, first, memory, ports } = await navigationAtTheSecondProject()
    bar.back()
    follow(memory)
    await settle()
    expect(flows).toHaveLength(1)

    bar.forward()
    follow(memory)
    expect(flows).toHaveLength(2)
    const forwardFlow = flows[1]

    takeCommitted(memory, { ports, handle: first, failure: null })
    afterRender(memory)
    expect(bar.hash()).toBe(addressOf(SECOND_ID))
    const opened = await forwardFlow?.(ports, first)
    expect(opened).toMatchObject({ ok: true, handle: { id: SECOND_ID } })
  })

  it('hands the project of the moved-to place to the owner when the browser moves after an editor flow gave another project', async () => {
    const { flows, first, memory, ports } = await navigationAtTheSecondProject()
    await runFlowOf(memory)(switchTo(FIRST_ID))
    expect(flows).toHaveLength(1)

    follow(memory)
    expect(flows).toHaveLength(2)

    takeCommitted(memory, { ports, handle: first, failure: null })
    const opened = await flows[1]?.(ports, first)
    expect(opened).toMatchObject({ ok: true, handle: { id: SECOND_ID } })
  })
})

describe('the project that a flow opened, when nothing is open afterwards', () => {
  it('retries the project that the flow opened, not the project before the flow, after a folder permission failure', async () => {
    const { flows, first, memory, ports } = await navigationAtTheSecondProject()
    await runFlowOf(memory)(switchTo(FIRST_ID))
    takeCommitted(memory, { ports, handle: first, failure: null })
    takeCommitted(memory, { ports, handle: null, failure: { kind: 'folder-permission' } })

    retryNotice(memory)

    expect(flows).toHaveLength(2)
    const reopened = await flows[1]?.(ports, first)
    expect(reopened).toMatchObject({ ok: true, handle: { id: FIRST_ID } })
  })
})
