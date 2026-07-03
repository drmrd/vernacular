import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { addEnvironmentScene, createEmptyProject, type EnvironmentScene } from '../../core'
import { createEditorSession } from '../session/editor-session'
import { EditorSessionProvider } from './editor-session-provider'
import { useProjectEnvironmentScenes } from './use-project-environment-scenes'

function sampleProject() {
  return createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

const SAVED_SCENE: EnvironmentScene = {
  id: 'scene-winter-dusk',
  name: 'Winter dusk',
  observedAt: '2026-12-21T16:30',
  weather: { cloudCover: 0.2 },
}

describe('useProjectEnvironmentScenes', () => {
  it('returns the same empty array reference across re-renders for a project with no saved scenes', () => {
    const session = createEditorSession(sampleProject())
    function wrapper({ children }: { children: ReactNode }) {
      return <EditorSessionProvider session={session}>{children}</EditorSessionProvider>
    }

    const { result, rerender } = renderHook(() => useProjectEnvironmentScenes(), { wrapper })
    const first = result.current
    rerender()

    expect(result.current).toEqual([])
    expect(result.current).toBe(first)
  })

  it('returns a list containing the added scene once environment-scene/add is dispatched', () => {
    const session = createEditorSession(sampleProject())
    function wrapper({ children }: { children: ReactNode }) {
      return <EditorSessionProvider session={session}>{children}</EditorSessionProvider>
    }

    const { result } = renderHook(() => useProjectEnvironmentScenes(), { wrapper })

    act(() => {
      session.dispatch(addEnvironmentScene(SAVED_SCENE))
    })

    expect(result.current).toContainEqual(SAVED_SCENE)
  })
})
