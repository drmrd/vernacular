import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'

import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import { useEdgeOverlay } from './use-framed-scene'

afterEach(cleanup)

const EDGE_OVERLAY_ON = true
const EDGE_OVERLAY_OFF = false

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function renderEdgeOverlayOn(store: SceneSessionStore) {
  return renderHook(() => useEdgeOverlay(), { wrapper: providerAround(store) })
}

describe('useEdgeOverlay', () => {
  it('starts with the overlay off and turns it on when toggled', () => {
    const { result } = renderHook(() => useEdgeOverlay())

    expect(result.current.edgeOverlay).toBe(EDGE_OVERLAY_OFF)

    act(() => result.current.toggleEdgeOverlay())

    expect(result.current.edgeOverlay).toBe(EDGE_OVERLAY_ON)
  })
})

describe('useEdgeOverlay inside a scene session provider', () => {
  it('starts from the overlay setting the session already holds', () => {
    const store = createSceneSessionStore({ edgeOverlay: EDGE_OVERLAY_ON })

    const { result } = renderEdgeOverlayOn(store)

    expect(result.current.edgeOverlay).toBe(EDGE_OVERLAY_ON)
  })

  it('records an overlay toggle in the session', () => {
    const store = createSceneSessionStore()
    const { result } = renderEdgeOverlayOn(store)

    act(() => result.current.toggleEdgeOverlay())

    expect(store.getSceneSession().edgeOverlay).toBe(EDGE_OVERLAY_ON)
  })

  it('hands a remounted view the overlay setting the earlier mount left behind', () => {
    const store = createSceneSessionStore()
    const firstMount = renderEdgeOverlayOn(store)

    act(() => firstMount.result.current.toggleEdgeOverlay())
    firstMount.unmount()

    const secondMount = renderEdgeOverlayOn(store)

    expect(secondMount.result.current.edgeOverlay).toBe(EDGE_OVERLAY_ON)
  })
})
