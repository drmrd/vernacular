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

function sceneRenameInputId(id: string): string {
  return `environment-scene-rename-${id}`
}

interface SceneRenameFormProps {
  scene: EnvironmentScene
}

// The inline rename editor for a saved scene: a text input pre-filled with the
// scene's current name.
function SceneRenameForm({ scene }: SceneRenameFormProps): ReactElement {
  const [draft, setDraft] = useState(scene.name)
  const inputId = sceneRenameInputId(scene.id)
  return (
    <Field htmlFor={inputId} label={`Rename ${scene.name}`}>
      <input
        id={inputId}
        value={draft}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
      />
    </Field>
  )
}

interface SceneRowProps {
  scene: EnvironmentScene
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
  dispatch: (command: Command) => void
}

// A saved scene: its name, the observation instant it captured, and the apply,
// rename, and remove actions. Apply recalls the scene's when-and-weather; rename
// swaps the row for an inline editor; remove drops it.
function SceneRow({
  scene,
  environment,
  onEnvironmentChange,
  dispatch,
}: SceneRowProps): ReactElement {
  const [renaming, setRenaming] = useState(false)
  const handleApply = () => {
    onEnvironmentChange(applyEnvironmentScene(environment, scene))
  }
  const handleRemove = () => {
    dispatch(removeEnvironmentScene(scene.id))
  }
  if (renaming) {
    return (
      <li>
        <SceneRenameForm scene={scene} />
      </li>
    )
  }
  return (
    <li>
      <span>{scene.name}</span>
      <span>{formatObservationDateTime(parseObservationInstant(scene.observedAt))}</span>
      <Button type="button" onClick={handleApply}>
        Apply {scene.name}
      </Button>
      <Button type="button" onClick={() => setRenaming(true)}>
        Rename {scene.name}
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
