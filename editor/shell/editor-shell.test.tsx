import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorShell } from './editor-shell'

describe('EditorShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders labeled toolbar, tools, viewport, and inspector regions', () => {
    // The viewport hosts SceneCanvas, which reads navigator.gpu; stub navigator with
    // no gpu so it deterministically takes its no-WebGPU fallback branch.
    vi.stubGlobal('navigator', {})

    render(<EditorShell />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /vernacular/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /tools/i })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /inspector/i })).toBeInTheDocument()
  })
})
