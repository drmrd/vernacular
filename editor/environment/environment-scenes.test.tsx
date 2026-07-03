import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_ENVIRONMENT_STATE,
  observationInstantToIso,
  parseObservationInstant,
  type Command,
  type EnvironmentScene,
  type EnvironmentState,
} from '../../core'
import { EnvironmentScenes } from './environment-scenes'

afterEach(cleanup)

const SAVED_SCENE: EnvironmentScene = {
  id: 'scene-winter-dusk',
  name: 'Winter dusk',
  observedAt: '2026-12-21T16:30',
  weather: { cloudCover: 0.2 },
}

interface AddEnvironmentSceneCommand extends Command<{ scene: EnvironmentScene }> {
  type: 'environment-scene/add'
}

describe('EnvironmentScenes saving the current conditions', () => {
  it('dispatches environment-scene/add with the typed name, the current observed instant, and the current cloud cover when Save scene is pressed', async () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 720 },
      cloudCover: 0.35,
    }
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(
      <EnvironmentScenes
        scenes={[]}
        environment={environment}
        onEnvironmentChange={vi.fn()}
        dispatch={dispatch}
      />,
    )

    await user.type(screen.getByLabelText(/scene name/i), 'Summer noon')
    await user.click(screen.getByRole('button', { name: /save scene/i }))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as AddEnvironmentSceneCommand
    expect(command.type).toBe('environment-scene/add')
    expect(command.params.scene.name).toBe('Summer noon')
    expect(command.params.scene.observedAt).toBe(observationInstantToIso(environment.observedAt))
    expect(command.params.scene.weather?.cloudCover).toBe(environment.cloudCover)
    expect(typeof command.params.scene.id).toBe('string')
    expect(command.params.scene.id.length).toBeGreaterThan(0)
  })
})

describe('EnvironmentScenes applying a saved scene', () => {
  it('calls onEnvironmentChange with the scene instant and cloud cover, leaving mode and colorCheck untouched, when Apply is pressed', async () => {
    const environment: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      mode: 'realistic',
      colorCheck: true,
      observedAt: { date: '2026-01-01', minutesSinceMidnight: 0 },
      cloudCover: 0.9,
    }
    const onEnvironmentChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EnvironmentScenes
        scenes={[SAVED_SCENE]}
        environment={environment}
        onEnvironmentChange={onEnvironmentChange}
        dispatch={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: `Apply ${SAVED_SCENE.name}` }))

    expect(onEnvironmentChange).toHaveBeenCalledWith({
      ...environment,
      observedAt: parseObservationInstant(SAVED_SCENE.observedAt),
      cloudCover: SAVED_SCENE.weather?.cloudCover,
    })
  })
})

describe('EnvironmentScenes removing a saved scene', () => {
  it('dispatches environment-scene/remove with the scene id when Remove is pressed', async () => {
    const dispatch = vi.fn()
    const user = userEvent.setup()
    render(
      <EnvironmentScenes
        scenes={[SAVED_SCENE]}
        environment={DEFAULT_ENVIRONMENT_STATE}
        onEnvironmentChange={vi.fn()}
        dispatch={dispatch}
      />,
    )

    await user.click(screen.getByRole('button', { name: `Remove ${SAVED_SCENE.name}` }))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'environment-scene/remove',
      params: { id: SAVED_SCENE.id },
      description: expect.any(String),
    })
  })
})

describe('EnvironmentScenes with no saved scenes', () => {
  it('renders a short empty message', () => {
    render(
      <EnvironmentScenes
        scenes={[]}
        environment={DEFAULT_ENVIRONMENT_STATE}
        onEnvironmentChange={vi.fn()}
        dispatch={vi.fn()}
      />,
    )

    expect(screen.getByText(/no saved scenes/i)).toBeInTheDocument()
  })
})
