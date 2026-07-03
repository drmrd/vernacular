import { useState, type ChangeEvent, type ReactElement } from 'react'
import type { Command, EnvironmentScene, EnvironmentState } from '../../core'
import {
  addEnvironmentScene,
  applyEnvironmentScene,
  captureEnvironmentScene,
  formatObservationDateTime,
  parseObservationInstant,
  removeEnvironmentScene,
} from '../../core'
import { Button, Field, Stack } from '../design-system'

const SCENE_NAME_INPUT_ID = 'environment-scene-name'

export interface EnvironmentScenesProps {
  scenes: EnvironmentScene[]
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
  dispatch: (command: Command) => void
}

interface SaveSceneFormProps {
  environment: EnvironmentState
  dispatch: (command: Command) => void
}

// The save form: a name for the current conditions, captured into a scene with a
// freshly generated id (the factories convention) and dispatched to the model.
function SaveSceneForm({ environment, dispatch }: SaveSceneFormProps): ReactElement {
  const [name, setName] = useState('')
  const trimmedName = name.trim()
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value)
  }
  const handleSave = () => {
    if (trimmedName === '') {
      return
    }
    const scene = captureEnvironmentScene(environment, {
      id: globalThis.crypto.randomUUID(),
      name: trimmedName,
    })
    dispatch(addEnvironmentScene(scene))
    setName('')
  }
  return (
    <Stack direction="horizontal">
      <Field htmlFor={SCENE_NAME_INPUT_ID} label="Scene name">
        <input id={SCENE_NAME_INPUT_ID} type="text" value={name} onChange={handleChange} />
      </Field>
      <Button type="button" onClick={handleSave} disabled={trimmedName === ''}>
        Save scene
      </Button>
    </Stack>
  )
}

interface SceneRowProps {
  scene: EnvironmentScene
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
  dispatch: (command: Command) => void
}

// A saved scene: its name, the observation instant it captured, and the apply and
// remove actions. Apply recalls the scene's when-and-weather; remove drops it.
function SceneRow({
  scene,
  environment,
  onEnvironmentChange,
  dispatch,
}: SceneRowProps): ReactElement {
  const handleApply = () => {
    onEnvironmentChange(applyEnvironmentScene(environment, scene))
  }
  const handleRemove = () => {
    dispatch(removeEnvironmentScene(scene.id))
  }
  return (
    <li>
      <span>{scene.name}</span>
      <span>{formatObservationDateTime(parseObservationInstant(scene.observedAt))}</span>
      <Button type="button" onClick={handleApply}>
        Apply {scene.name}
      </Button>
      <Button type="button" variant="destructive" onClick={handleRemove}>
        Remove {scene.name}
      </Button>
    </li>
  )
}

export function EnvironmentScenes({
  scenes,
  environment,
  onEnvironmentChange,
  dispatch,
}: EnvironmentScenesProps): ReactElement {
  return (
    <Stack>
      <SaveSceneForm environment={environment} dispatch={dispatch} />
      {scenes.length === 0 ? (
        <p>No saved scenes yet.</p>
      ) : (
        <ul>
          {scenes.map((scene) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              environment={environment}
              onEnvironmentChange={onEnvironmentChange}
              dispatch={dispatch}
            />
          ))}
        </ul>
      )}
    </Stack>
  )
}
