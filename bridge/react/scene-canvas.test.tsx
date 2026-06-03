import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneCanvas } from './scene-canvas'

describe('SceneCanvas', () => {
  it('renders an accessible fallback when WebGPU is unavailable', () => {
    render(<SceneCanvas />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/webgpu/i)
  })
})
