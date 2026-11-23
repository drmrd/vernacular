import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SceneChromeProvider } from './scene-chrome'
import { SceneFailureHost } from './scene-failure-host'
import { PLAIN_COULD_NOT_LOAD } from './scene-failure-probe-test-support'
import { CAMERA_PANE_MIN_HEIGHT_SHARE, ScenePaneShell } from './scene-pane-shell'

afterEach(cleanup)

function cameraPaneIn(container: HTMLElement): HTMLElement {
  const pane = container.querySelector<HTMLElement>('.scene-camera-pane')
  if (pane === null) throw new Error('the camera pane is not rendered')
  return pane
}

describe('ScenePaneShell', () => {
  it('reserves the camera pane min-height share so the toolbar above it scrolls instead of collapsing the canvas', () => {
    const { container } = render(
      <ScenePaneShell mode="orbit" aimGuide>
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    const pane = cameraPaneIn(container)
    expect(pane.style.minHeight).toBe(CAMERA_PANE_MIN_HEIGHT_SHARE)
    expect(pane.style.flexGrow).toBe('1')
  })

  it('shows the camera controls hint and the grab cursor over a working renderer', () => {
    const { container } = render(
      <ScenePaneShell mode="orbit" aimGuide>
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    expect(screen.getByRole('group', { name: 'Camera controls' })).toBeInTheDocument()
    expect(cameraPaneIn(container).style.cursor).toBe('grab')
  })

  it('removes the camera controls hint and the grab cursor while a failure view is mounted in it', () => {
    const { container } = render(
      <SceneChromeProvider>
        <ScenePaneShell mode="orbit" aimGuide>
          <SceneFailureHost kind="load" onReload={vi.fn()} />
        </ScenePaneShell>
      </SceneChromeProvider>,
    )

    const pane = cameraPaneIn(container)
    expect(screen.queryByRole('group', { name: 'Camera controls' })).toBeNull()
    expect(pane.style.cursor).toBe('')
    expect(pane.style.minHeight).toBe(CAMERA_PANE_MIN_HEIGHT_SHARE)
    expect(screen.getByRole('alert')).toHaveTextContent(PLAIN_COULD_NOT_LOAD)
  })

  it('shows the aim dot in walk mode while the aim guide is on', () => {
    const { container } = render(
      <ScenePaneShell mode="walk" aimGuide>
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    const dots = container.querySelectorAll<HTMLElement>('.aim-reticle')
    expect(dots).toHaveLength(1)
    expect(dots[0]).toHaveAttribute('aria-hidden', 'true')
    expect(dots[0]?.style.pointerEvents).toBe('none')
  })

  it('shows no aim dot while the aim guide is off', () => {
    const { container } = render(
      <ScenePaneShell mode="walk" aimGuide={false}>
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    expect(container.querySelector('.aim-reticle')).toBeNull()
  })

  it('shows no aim dot in orbit mode', () => {
    const { container } = render(
      <ScenePaneShell mode="orbit" aimGuide>
        <div>canvas stand-in</div>
      </ScenePaneShell>,
    )

    expect(container.querySelector('.aim-reticle')).toBeNull()
  })
})
