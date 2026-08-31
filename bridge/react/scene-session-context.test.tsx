import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, renderHook, screen, act, fireEvent, cleanup } from '@testing-library/react'
import {
  createSceneSessionStore,
  type SceneSessionStore,
} from '../scene-session/scene-session-store'
import { SceneSessionProvider } from './scene-session-provider'
import { useSceneSession, useSceneSessionStore } from './scene-session-context'

afterEach(cleanup)

const EDGE_OVERLAY_ON = 'edge overlay on'
const EDGE_OVERLAY_OFF = 'edge overlay off'
const OUTSIDE_PROVIDER_MESSAGE = 'useSceneSessionStore must be used within a SceneSessionProvider'

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function EdgeOverlayToggle() {
  const { sceneSession, updateSceneSession } = useSceneSession()
  return (
    <button type="button" onClick={() => updateSceneSession({ edgeOverlay: true })}>
      {sceneSession.edgeOverlay ? EDGE_OVERLAY_ON : EDGE_OVERLAY_OFF}
    </button>
  )
}

describe('useSceneSessionStore', () => {
  it('refuses to hand out a session store outside a scene session provider', () => {
    function Orphan() {
      useSceneSessionStore()
      return null
    }

    expect(() => render(<Orphan />)).toThrow(OUTSIDE_PROVIDER_MESSAGE)
  })

  it('hands consumers the same store the provider was given', () => {
    const store = createSceneSessionStore()

    const { result } = renderHook(() => useSceneSessionStore(), {
      wrapper: providerAround(store),
    })

    expect(result.current).toBe(store)
  })
})

describe('useSceneSession', () => {
  it('starts from the session the store already holds rather than a fresh default', () => {
    const store = createSceneSessionStore({ cameraMode: 'walk' })

    const { result } = renderHook(() => useSceneSession(), { wrapper: providerAround(store) })

    expect(result.current.sceneSession.cameraMode).toBe('walk')
  })

  it('re-renders the consumer and records the change when a consumer updates the session', () => {
    const store = createSceneSessionStore()
    render(
      <SceneSessionProvider store={store}>
        <EdgeOverlayToggle />
      </SceneSessionProvider>,
    )

    expect(screen.getByRole('button')).toHaveTextContent(EDGE_OVERLAY_OFF)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveTextContent(EDGE_OVERLAY_ON)
    expect(store.getSceneSession().edgeOverlay).toBe(true)
  })

  it('re-renders the consumer when the session changes outside React', () => {
    const store = createSceneSessionStore()
    render(
      <SceneSessionProvider store={store}>
        <EdgeOverlayToggle />
      </SceneSessionProvider>,
    )

    act(() => {
      store.updateSceneSession({ edgeOverlay: true })
    })

    expect(screen.getByRole('button')).toHaveTextContent(EDGE_OVERLAY_ON)
  })
})
