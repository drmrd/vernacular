import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'

describe('SceneCanvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders an accessible fallback when WebGPU is unavailable', () => {
    vi.stubGlobal('navigator', {})

    render(<SceneCanvas />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/webgpu/i)
  })
})
