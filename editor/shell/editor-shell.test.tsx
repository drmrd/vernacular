import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorShell } from './editor-shell'

describe('EditorShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders labeled toolbar, tools, viewport, and inspector regions', () => {
    vi.stubGlobal('navigator', {})

    render(<EditorShell />)

    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})
