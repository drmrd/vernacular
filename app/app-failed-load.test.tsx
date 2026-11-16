import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { App } from './app'
import {
  InMemoryActiveProjectIdStore,
  InMemoryProjectStore,
  type ActiveProjectIdStore,
} from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

function namedProject(name: string): Project {
  const base = createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
  return { ...base, floors: [createFloor('Ground')] }
}

// The breadcrumb landmark names the open project, so it identifies which one opened.
async function openProjectName(): Promise<string | null> {
  const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
  return within(breadcrumb).getByText(/.+/).textContent
}

async function rememberedId(id: string): Promise<ActiveProjectIdStore> {
  const port = new InMemoryActiveProjectIdStore()
  await port.write(id)
  return port
}

describe('The application opens the remembered project', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under the remembered id', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', namedProject('Old Cottage'))
    await store.save('project-second', namedProject('Second House'))

    render(<App store={store} activeProjectIds={await rememberedId('project-second')} />)

    expect(await openProjectName()).toBe('Second House')
  })

  it('opens the project stored under current when nothing is remembered', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', namedProject('Old Cottage'))
    await store.save('project-second', namedProject('Second House'))

    render(<App store={store} activeProjectIds={new InMemoryActiveProjectIdStore()} />)

    expect(await openProjectName()).toBe('Old Cottage')
  })

  it('prefers the projectId property over the remembered id', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('project-first', namedProject('First House'))
    await store.save('project-second', namedProject('Second House'))

    render(
      <App
        store={store}
        projectId="project-first"
        activeProjectIds={await rememberedId('project-second')}
      />,
    )

    expect(await openProjectName()).toBe('First House')
  })

  it('opens a fresh project when the store no longer holds the remembered id', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    await store.save('current', namedProject('Old Cottage'))
    const load = vi.spyOn(store, 'load')

    render(<App store={store} activeProjectIds={await rememberedId('project-gone')} />)

    expect(await openProjectName()).toBe('Untitled project')
    expect(load).toHaveBeenCalledWith('project-gone')
    expect(load).not.toHaveBeenCalledWith('current')
  })
})
