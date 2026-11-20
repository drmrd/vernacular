import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { InMemoryProjectIndex } from '../storage'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  openProjectName,
  plantProject,
  renderApp,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'

/** An in-memory index whose reads throw before they return a promise. */
function indexWhoseReadsThrow(): InMemoryProjectIndex {
  const index = new InMemoryProjectIndex()
  const refuse = () => {
    throw new Error('storage is unavailable')
  }
  vi.spyOn(index, 'all').mockImplementation(refuse)
  vi.spyOn(index, 'get').mockImplementation(refuse)
  return index
}

describe('An index whose read throws', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under current and reports no error', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ports = createTestPorts({ index: indexWhoseReadsThrow() })
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const error = vi.spyOn(console, 'error')

    renderApp(ports)

    expect(await openProjectName()).toBe(KEPT_NAME)
    expect(error).not.toHaveBeenCalled()
  })
})
