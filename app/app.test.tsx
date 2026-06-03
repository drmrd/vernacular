import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { App } from './app'
import { InMemoryProjectStore } from '../storage'

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('boots from the store and renders the editor shell with a ground floor', async () => {
    vi.stubGlobal('navigator', {})

    render(<App store={new InMemoryProjectStore()} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /vernacular/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByText(/walls: 0/i)).toBeInTheDocument()
  })

  it('shows a recoverable error when the project fails to load', async () => {
    vi.stubGlobal('navigator', {})
    const store = new InMemoryProjectStore()
    vi.spyOn(store, 'load').mockRejectedValue(new Error('disk fault'))

    render(<App store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
  })
})
