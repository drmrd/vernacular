import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CAMERA_PANE_MIN_HEIGHT_SHARE, ScenePaneShell } from './webgpu-scene-view'

describe('ScenePaneShell', () => {
  afterEach(cleanup)

  it('reserves the camera pane min-height share so the toolbar above it scrolls instead of collapsing the canvas', () => {
    const { container } = render(
      <ScenePaneShell mode="orbit">
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    const pane = container.querySelector('.scene-camera-pane')
    expect(pane).not.toBeNull()
    expect((pane as HTMLElement).style.minHeight).toBe(CAMERA_PANE_MIN_HEIGHT_SHARE)
    expect((pane as HTMLElement).style.flexGrow).toBe('1')
  })
})
