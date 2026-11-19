import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { ActiveProjectIdStore } from '../storage'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  openProjectName,
  plantProject,
  renderApp,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'

describe('A port whose read throws', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under current and reports no error', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const error = vi.spyOn(console, 'error')
    const port: ActiveProjectIdStore = {
      read: () => {
        throw new Error('storage is unavailable')
      },
      write: () => Promise.resolve(),
    }

    renderApp(ports, { activeProjectIds: port })

    expect(await openProjectName()).toBe(KEPT_NAME)
    expect(error).not.toHaveBeenCalled()
  })
})
