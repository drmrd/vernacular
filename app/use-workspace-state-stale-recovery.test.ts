import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { NotificationProvider } from '../editor/design-system'
import type { DocumentHandle } from '../session'
import {
  autosaveFolderOf,
  plantRefusedCopy,
} from '../session/handle/handle-refused-snapshots-test-kit'
import {
  createTestPorts,
  openOrThrow,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import type { EditorWorkspaceProps } from './app'
import { namedProject, projectWithWalls, workspaceProps } from './app-test-support'
import type { RunFlow } from './use-open-project'
import { useWorkspaceState } from './use-workspace-state'

const FIRST_ID = 'first'
const SECOND_ID = 'second'
const RECOVERED_NAME = 'Recovered'

/** Every handle that a case opened, closed after it. */
const handles: DocumentHandle[] = []

afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.all(handles.splice(0).map((handle) => handle.close()))
  })
  vi.restoreAllMocks()
})

/** Stores a project under `id`, opens it, and plants a recovery copy that can be read. */
async function openRecoverable(ports: TestPorts, id: string): Promise<DocumentHandle> {
  await ports.workspace.save(id, namedProject(`Project ${id}`))
  const handle = await openOrThrow(ports, workspaceRequest(id))
  handles.push(handle)
  await ports.workspace.snapshots(id).writeSnapshot(projectWithWalls(RECOVERED_NAME, 1))
  return handle
}

/** Puts a copy that is not JSON in the place of each recovery copy that the project `id` holds. */
async function makeEachCopyUnreadable(ports: TestPorts, id: string): Promise<void> {
  const folder = autosaveFolderOf(id)
  const copies = (await ports.root.list(folder)).filter((name) => name.startsWith('snapshot-'))
  await Promise.all(copies.map((name) => plantRefusedCopy(ports.root, folder, name)))
}

/** An owner that hands every flow the ports and `current`. */
function ownerHanding(ports: TestPorts, current: DocumentHandle): RunFlow {
  return async (flow) => {
    const result = await flow(ports, current)
    if (result.ok) handles.push(result.handle)
    return result
  }
}

interface HeldCheck {
  /** True once a check of recoverable work was asked and is waiting. */
  asked(): boolean
  /** Answers the waiting check with `false`: no recoverable work is left. */
  answerNothingLeft(): void
}

/**
 * Makes the checks of recoverable work of `handle` that come after this call wait for the test.
 * The checks that came before this call were real.
 */
function holdChecksOf(handle: DocumentHandle): HeldCheck {
  let answer: ((recoverable: boolean) => void) | undefined
  let asked = false
  vi.spyOn(handle.snapshots, 'isRecoverable').mockImplementation(() => {
    asked = true
    return new Promise<boolean>((resolve) => {
      answer = resolve
    })
  })
  return {
    asked: () => asked,
    answerNothingLeft: () => answer?.(false),
  }
}

function renderWorkspaceState(props: EditorWorkspaceProps) {
  return renderHook((current: EditorWorkspaceProps) => useWorkspaceState(current), {
    initialProps: props,
    wrapper: NotificationProvider,
  })
}

/** A restore of the first project that gives `did-not-restore`, and waits on its recovery check. */
async function restoreWaitingOnItsCheck() {
  const ports = createTestPorts()
  const first = await openRecoverable(ports, FIRST_ID)
  const props = workspaceProps(first, { runFlow: ownerHanding(ports, first) })
  const view = renderWorkspaceState(props)
  await waitFor(() => expect(view.result.current.recovery).not.toBeNull())
  await makeEachCopyUnreadable(ports, FIRST_ID)
  const check = holdChecksOf(first)
  let restoring: Promise<unknown> | undefined
  await act(async () => {
    restoring = Promise.resolve(view.result.current.recovery?.onRestore())
  })
  await waitFor(() => expect(check.asked()).toBe(true))
  return { ports, props, view, check, restoring: restoring ?? Promise.resolve() }
}

describe('useWorkspaceState recovery check after a restore that did not restore', () => {
  it('hides the prompt when the check finds no recoverable work left', async () => {
    const { view, check, restoring } = await restoreWaitingOnItsCheck()

    await act(async () => {
      check.answerNothingLeft()
      await restoring
    })

    expect(view.result.current.recovery).toBeNull()
  })

  it('leaves the prompt of a project that replaced it alone when the late answer arrives', async () => {
    const { ports, props, view, check, restoring } = await restoreWaitingOnItsCheck()
    const second = await openRecoverable(ports, SECOND_ID)
    const secondChecks = vi.spyOn(second.snapshots, 'isRecoverable')
    view.rerender({ ...props, handle: second, runFlow: ownerHanding(ports, second) })
    await waitFor(() => expect(secondChecks).toHaveBeenCalled())
    await act(async () => {
      await secondChecks.mock.results[0]?.value
    })
    await waitFor(() => expect(view.result.current.recovery).not.toBeNull())

    await act(async () => {
      check.answerNothingLeft()
      await restoring
    })

    expect(view.result.current.recovery).not.toBeNull()
  })
})
