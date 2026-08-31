import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { createSceneSessionStore } from '../scene-session/scene-session-store'
import { SceneSessionProvider } from './scene-session-provider'

afterEach(cleanup)

// The live-view capture gate waits on exactly this selector, so the unit test spells it the
// way the browser will rather than reaching for a shared constant.
const READY_SELECTOR = '[data-live-view-ready="true"]'
const PREVIEW_SUBTREE = 'preview-subtree'

describe('SceneSessionProvider', () => {
  it('reports the live view ready once the session is restored and a frame has drawn after the latest pipeline build', () => {
    const store = createSceneSessionStore()
    const { container } = render(
      <SceneSessionProvider store={store}>
        <div data-testid={PREVIEW_SUBTREE}>the preview subtree</div>
      </SceneSessionProvider>,
    )
    const readyElement = () => container.querySelector<HTMLElement>(READY_SELECTOR)

    // Nothing restored, nothing drawn: whatever is on screen is not worth capturing.
    expect(readyElement()).toBeNull()

    // A frame draws before the stored session has been applied, so it still shows defaults
    // rather than the view the session describes.
    act(() => {
      store.updateSceneSession({ frameDrawnSincePipelineSettled: true })
    })
    expect(readyElement()).toBeNull()

    // Restore lands, so the frame already on screen is the one the session describes. The
    // attribute rides the element that wraps the preview subtree, which is what the gate
    // locates in the browser.
    act(() => {
      store.updateSceneSession({ sessionRestored: true })
    })
    expect(readyElement()).toContainElement(screen.getByTestId(PREVIEW_SUBTREE))

    // A pipeline rebuild starts and clears the drawn-frame fact: the pixels on screen came
    // from the pipeline that is being replaced.
    act(() => {
      store.updateSceneSession({ frameDrawnSincePipelineSettled: false })
    })
    expect(readyElement()).toBeNull()

    // The rebuild settles and the first frame after it draws.
    act(() => {
      store.updateSceneSession({ frameDrawnSincePipelineSettled: true })
    })
    expect(readyElement()).toContainElement(screen.getByTestId(PREVIEW_SUBTREE))
  })
})
