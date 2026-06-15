import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { cameraControlsHint, CameraControlsHint } from './camera-controls-hint'
import type { NavMode } from './scene-nav-toolbar'

describe('cameraControlsHint', () => {
  it('describes orbit mode as drag to orbit, right-drag to pan, and scroll to zoom', () => {
    const mode: NavMode = 'orbit'
    expect(cameraControlsHint(mode)).toEqual([
      'Drag to orbit',
      'Right-drag to pan',
      'Scroll to zoom',
    ])
  })

  it('describes walk mode as drag to look and W A S D to move', () => {
    const mode: NavMode = 'walk'
    expect(cameraControlsHint(mode)).toEqual(['Drag to look', 'W A S D to move'])
  })
})

describe('CameraControlsHint', () => {
  afterEach(cleanup)

  it('shows the orbit lines inside an accessible Camera controls group', () => {
    render(<CameraControlsHint mode="orbit" />)

    expect(screen.getByRole('group', { name: /camera controls/i })).toBeInTheDocument()
    expect(screen.getByText('Drag to orbit')).toBeInTheDocument()
    expect(screen.getByText('Right-drag to pan')).toBeInTheDocument()
    expect(screen.getByText('Scroll to zoom')).toBeInTheDocument()
  })

  it('shows the walk lines and omits the orbit-only line in walk mode', () => {
    render(<CameraControlsHint mode="walk" />)

    expect(screen.getByText('Drag to look')).toBeInTheDocument()
    expect(screen.getByText('W A S D to move')).toBeInTheDocument()
    expect(screen.queryByText('Drag to orbit')).toBeNull()
  })
})
