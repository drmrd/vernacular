import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { reconcileIndex, type SessionPorts } from '../session'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import { plantProject, settleForAWhile, usedLast } from './app-test-support'
import { holdIndexReads } from './held-index-test-support'
import { useStartProjectId } from './use-start-project-id'

const FIRST_ID = 'project-a'
const SECOND_ID = 'project-b'

/** Ports whose index holds a record of the one project stored under `id`, used last. */
async function portsUsedLastIn(id: string): Promise<TestPorts> {
  const ports = createTestPorts()
  await plantProject(ports, id, `House ${id}`)
  await reconcileIndex(ports)
  await usedLast(ports, id)
  return ports
}

/** Renders the start hook on `ports` with no override; a rerender gives it other ports. */
function renderStart(ports: SessionPorts) {
  return renderHook((props: { ports: SessionPorts }) => useStartProjectId(props.ports, undefined), {
    initialProps: { ports },
  })
}

/** Lets the pending reads and effects run inside `act`. */
async function flush(): Promise<void> {
  await act(async () => {})
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the start id when the ports change', () => {
  it('gives no id of the old ports after the ports change, and then the id of the new ports', async () => {
    const first = await portsUsedLastIn(FIRST_ID)
    const second = await portsUsedLastIn(SECOND_ID)
    const { result, rerender } = renderStart(first)
    await waitFor(() => expect(result.current).toBe(FIRST_ID))
    const releaseSecond = holdIndexReads(second.index)

    rerender({ ports: second })
    await flush()

    expect(result.current).toBeNull()
    await act(async () => releaseSecond())
    await waitFor(() => expect(result.current).toBe(SECOND_ID))
  })

  it('a read of the old ports that ends after the ports changed sets nothing', async () => {
    const first = await portsUsedLastIn(FIRST_ID)
    const second = await portsUsedLastIn(SECOND_ID)
    const releaseFirst = holdIndexReads(first.index)
    const { result, rerender } = renderStart(first)
    await flush()

    rerender({ ports: second })
    await waitFor(() => expect(result.current).toBe(SECOND_ID))
    await act(async () => releaseFirst())
    await settleForAWhile()

    expect(result.current).toBe(SECOND_ID)
  })
})
