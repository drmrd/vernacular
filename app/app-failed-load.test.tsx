import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { InMemoryActiveProjectIdStore } from '../storage'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  openProjectName,
  plantProject,
  rememberedId,
  renderApp,
  stubCapableStorage,
} from './app-test-support'

describe('The application opens the remembered project', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under the remembered id', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, 'current', 'Old Cottage')
    await plantProject(ports, 'project-second', 'Second House')

    renderApp(ports, { activeProjectIds: await rememberedId('project-second') })

    expect(await openProjectName()).toBe('Second House')
  })

  it('opens the project stored under current when nothing is remembered', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, 'current', 'Old Cottage')
    await plantProject(ports, 'project-second', 'Second House')

    renderApp(ports, { activeProjectIds: new InMemoryActiveProjectIdStore() })

    expect(await openProjectName()).toBe('Old Cottage')
  })

  it('prefers the projectId property over the remembered id', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, 'project-first', 'First House')
    await plantProject(ports, 'project-second', 'Second House')

    renderApp(ports, {
      projectId: 'project-first',
      activeProjectIds: await rememberedId('project-second'),
    })

    expect(await openProjectName()).toBe('First House')
  })

  it('opens a fresh project when the store no longer holds the remembered id', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, 'current', 'Old Cottage')
    const read = vi.spyOn(ports.workspace, 'read')

    renderApp(ports, { activeProjectIds: await rememberedId('project-gone') })

    expect(await openProjectName()).toBe('Untitled project')
    expect(read).toHaveBeenCalledWith('project-gone')
    expect(read).not.toHaveBeenCalledWith('current')
  })
})
