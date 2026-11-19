import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebLocksProjectLockPort } from '../../storage'
import { renamed, soundProject } from '../../tests/storage/conformance/conformance-documents'
import type { SessionPorts } from '../ports'
import { createTestPorts, rename, workspaceRequest } from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

/** How long a case waits for an open that may never settle, before it calls it unsettled. */
const SETTLE_WAIT_MS = 50
const PROJECT_ID = 'a'
const CREATED_NAME = 'Started here'
const EDITED_NAME = 'Edited here'

/** A browser that has the Web Locks API and refuses every call with a SecurityError. */
const refusingLocks = {
  request: (): Promise<never> => Promise.reject(refusal()),
  query: (): Promise<never> => Promise.reject(refusal()),
}

function refusal(): DOMException {
  return new DOMException('Access to the Locks API is denied in this context.', 'SecurityError')
}

const DID_NOT_SETTLE = Symbol('did not settle')

/** The value of `promise`, or `DID_NOT_SETTLE` when it is still pending after the bounded wait. */
async function settledWithinBound<T>(promise: Promise<T>): Promise<T | typeof DID_NOT_SETTLE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<typeof DID_NOT_SETTLE>((resolve) => {
    timer = setTimeout(() => resolve(DID_NOT_SETTLE), SETTLE_WAIT_MS)
  })
  try {
    return await Promise.race([promise, bound])
  } finally {
    clearTimeout(timer)
  }
}

/** Test ports whose locks are the Web Locks port of a browser that refuses every lock call. */
function portsWithRefusedLocks(): SessionPorts {
  return { ...createTestPorts(), locks: new WebLocksProjectLockPort() }
}

describe('opening a project when the browser refuses the lock request', () => {
  // The lock port tests of storage pin that a refused request leaves no unhandled rejection. This
  // listener only keeps one stray rejection from failing the whole run instead of this case.
  const ignoreUnhandled = (): void => undefined

  beforeEach(() => {
    process.on('unhandledRejection', ignoreUnhandled)
    vi.stubGlobal('navigator', { locks: refusingLocks })
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
