import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './app'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('composes the editor session and renders the editor shell', () => {
    vi.stubGlobal('navigator', {})

    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
  })
})
