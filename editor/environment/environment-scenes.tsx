import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import type { Command, EnvironmentScene, EnvironmentState } from '../../core'
import {
  addEnvironmentScene,
  applyEnvironmentScene,
  captureEnvironmentScene,
  formatObservationDateTime,
  parseObservationInstant,
  removeEnvironmentScene,
  renameEnvironmentScene,
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
  onCommit: (name: string) => void
  onCancel: () => void
}

// The inline rename editor for a saved scene: a text input pre-filled with the
// scene's current name. Enter (form submit) commits the draft; Escape abandons
// it and restores the row's normal Apply and Remove buttons.
function SceneRenameForm({ scene, onCommit, onCancel }: SceneRenameFormProps): ReactElement {
  const [draft, setDraft] = useState(scene.name)
  const inputId = sceneRenameInputId(scene.id)
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onCommit(draft)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onCancel()
    }
  }
  return (
    <form onSubmit={handleSubmit}>
      <Field htmlFor={inputId} label={`Rename ${scene.name}`}>
        <input
          id={inputId}
          value={draft}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Field>
      <Button type="submit">Save name</Button>
    </form>
  )
}

interface SceneRowActionsProps {
  scene: EnvironmentScene
  onApply: () => void
  onRename: () => void
  onRemove: () => void
}

// The saved-scene row's actions: apply recalls the scene's when-and-weather,
// rename starts the inline editor, and remove drops the scene.
function SceneRowActions({
  scene,
  onApply,
  onRename,
  onRemove,
}: SceneRowActionsProps): ReactElement {
  return (
    <>
      <Button type="button" onClick={onApply}>
        Apply {scene.name}
      </Button>
      <Button type="button" onClick={onRename}>
        Rename {scene.name}
      </Button>
      <Button type="button" variant="destructive" onClick={onRemove}>
        Remove {scene.name}
      </Button>
    </>
  )
}

interface SceneRowProps {
  scene: EnvironmentScene
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
  dispatch: (command: Command) => void
}

// A saved scene: its name, the observation instant it captured, and the apply,
// rename, and remove actions. Rename swaps the row for an inline editor.
function SceneRow({
  scene,
  environment,
  onEnvironmentChange,
  dispatch,
}: SceneRowProps): ReactElement {
  const [renaming, setRenaming] = useState(false)
  const handleRenameCommit = (name: string) => {
    const trimmedName = name.trim()
    if (trimmedName !== '') {
      dispatch(renameEnvironmentScene(scene.id, trimmedName))
    }
    setRenaming(false)
  }
  if (renaming) {
    return (
      <li>
        <SceneRenameForm
          scene={scene}
          onCommit={handleRenameCommit}
          onCancel={() => setRenaming(false)}
        />
      </li>
    )
  }
  return (
    <li>
      <span>{scene.name}</span>
      <span>{formatObservationDateTime(parseObservationInstant(scene.observedAt))}</span>
      <SceneRowActions
        scene={scene}
        onApply={() => onEnvironmentChange(applyEnvironmentScene(environment, scene))}
        onRename={() => setRenaming(true)}
        onRemove={() => dispatch(removeEnvironmentScene(scene.id))}
      />
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
