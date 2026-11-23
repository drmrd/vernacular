import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createEnvironmentSessionStore,
  createSceneSessionStore,
  EnvironmentSessionProvider,
  SceneSessionProvider,
} from '../index'
import { SceneViewToolbar } from './scene-view-toolbar'
import { useBuildingViewState } from './use-building-view-state'
import { useSceneEnvironment } from './use-scene-environment'
import { useSceneNavigation } from './use-scene-navigation'

afterEach(cleanup)

function ToolbarOverSession() {
  const nav = useSceneNavigation()
  const buildingView = useBuildingViewState()
  const viewEnvironment = useSceneEnvironment()
  return (
    <SceneViewToolbar
      nav={nav}
      buildingView={buildingView}
      edgeOverlay={false}
      onToggleEdgeOverlay={() => {}}
      viewEnvironment={viewEnvironment}
      doorway={null}
      lightingMode="schematic"
    />
  )
}

describe('SceneViewToolbar', () => {
  it('turns the aim guide off in the scene session when its toggle is clicked', async () => {
    const store = createSceneSessionStore()
    render(
      <EnvironmentSessionProvider store={createEnvironmentSessionStore()}>
        <SceneSessionProvider store={store}>
          <ToolbarOverSession />
        </SceneSessionProvider>
      </EnvironmentSessionProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Aim guide' }))

    expect(store.getSceneSession().aimGuide).toBe(false)
    expect(screen.getByRole('button', { name: 'Aim guide' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
