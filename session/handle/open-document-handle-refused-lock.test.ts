import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebLocksProjectLockPort } from '../../storage'
import {
  DID_NOT_SETTLE,
  rejectingLockManager,
  securityRefusal,
  settledWithinBound,
} from '../../storage/locks/lock-test-support'
import { renamed, soundProject } from '../../tests/storage/conformance/conformance-documents'
import type { SessionPorts } from '../ports'
import { createTestPorts, rename, workspaceRequest } from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const CREATED_NAME = 'Started here'
const EDITED_NAME = 'Edited here'

/** Test ports whose locks are the Web Locks port over the browser lock manager of the case. */
function portsWithRefusedLocks(): SessionPorts {
  return { ...createTestPorts(), locks: new WebLocksProjectLockPort() }
}

describe('opening a project when the browser refuses the lock request', () => {
  // The lock port tests of storage pin that a refused request leaves no unhandled rejection. This
  // listener only keeps one stray rejection from failing the whole run instead of this case.
  const ignoreUnhandled = (): void => undefined

  beforeEach(() => {
    process.on('unhandledRejection', ignoreUnhandled)
    vi.stubGlobal('navigator', { locks: rejectingLockManager(securityRefusal()) })
  })

  afterEach(() => {
    process.off('unhandledRejection', ignoreUnhandled)
    vi.unstubAllGlobals()
  })

  it('opens a project when the browser refuses the lock request', async () => {
    const ports = portsWithRefusedLocks()
    const create = (): ReturnType<typeof soundProject> => renamed(soundProject(), CREATED_NAME)

    const opened = await settledWithinBound(
      openDocumentHandle(ports, { ...workspaceRequest(PROJECT_ID), create }),
    )

    expect(opened, 'the open did not settle').not.toBe(DID_NOT_SETTLE)
    if (opened === DID_NOT_SETTLE || !opened.ok) {
      expect.fail(`Expected the open to succeed: ${JSON.stringify(opened)}`)
    }
    const { handle } = opened
    rename(handle, EDITED_NAME)
    expect(await handle.save()).toEqual({ ok: true })
    expect(await handle.close()).toEqual({ ok: true })
  })
})

describe('opening a project when the lock request rejects for another reason', () => {
  const ignoreUnhandled = (): void => undefined
  const rejection = new DOMException('The document is not fully active.', 'InvalidStateError')

  beforeEach(() => {
    process.on('unhandledRejection', ignoreUnhandled)
    vi.stubGlobal('navigator', { locks: rejectingLockManager(rejection) })
  })

  afterEach(() => {
    process.off('unhandledRejection', ignoreUnhandled)
    vi.unstubAllGlobals()
  })

  it('fails the open as storage-unavailable when the lock request rejects for another reason', async () => {
    const create = (): ReturnType<typeof soundProject> => renamed(soundProject(), CREATED_NAME)

    const opened = await settledWithinBound(
      openDocumentHandle(portsWithRefusedLocks(), { ...workspaceRequest(PROJECT_ID), create }),
    )

    expect(opened, 'the open did not settle').not.toBe(DID_NOT_SETTLE)
    expect(opened).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: rejection.message },
    })
  })
})
