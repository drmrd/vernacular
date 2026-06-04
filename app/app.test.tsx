import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { App } from './app'
import { InMemoryProjectStore } from '../storage'

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('boots from the store and renders the editor shell with a ground floor', async () => {
    stubCapableStorage()

    render(<App store={new InMemoryProjectStore()} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
  })

  it('shows a recoverable error when the project fails to load', async () => {
    stubCapableStorage()
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'load').mockRejectedValue(new Error('disk fault'))

    render(<App store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
  })

  it('warns once when booting into a storage-degraded environment', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Storage capabilities')),
    )
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('stays silent when storage is healthy', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App store={new InMemoryProjectStore()} />)

    await screen.findByRole('heading', { level: 1, name: /vernacular/i })
    // Flush the storage-probe microtask chain so the negative assertion is deterministic.
    await act(async () => {})

    expect(warn).not.toHaveBeenCalled()
  })
})
