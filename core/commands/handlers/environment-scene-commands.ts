import type { EnvironmentScene } from '../../model/environment-scene'
import type { Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const ADD_ENVIRONMENT_SCENE = 'environment-scene/add'

export interface AddEnvironmentSceneParams {
  scene: EnvironmentScene
}

export function addEnvironmentScene(scene: EnvironmentScene): Command<AddEnvironmentSceneParams> {
  return { type: ADD_ENVIRONMENT_SCENE, params: { scene }, description: 'Add environment scene' }
}

const addEnvironmentSceneHandler: CommandHandler<Project, AddEnvironmentSceneParams> = {
  apply(state, params) {
    // Reassign the whole array so the inverse-capture proxy records the root-level
    // change and undo restores the prior array reference.
    state.environmentScenes = [...(state.environmentScenes ?? []), params.scene]
  },
}

export const REMOVE_ENVIRONMENT_SCENE = 'environment-scene/remove'

export interface RemoveEnvironmentSceneParams {
  id: string
}

export function removeEnvironmentScene(id: string): Command<RemoveEnvironmentSceneParams> {
  return { type: REMOVE_ENVIRONMENT_SCENE, params: { id }, description: 'Remove environment scene' }
}

const removeEnvironmentSceneHandler: CommandHandler<Project, RemoveEnvironmentSceneParams> = {
  apply(state, params) {
    // A collection stays an array: an emptied list is `[]`, never undefined.
    state.environmentScenes = (state.environmentScenes ?? []).filter(
      (scene) => scene.id !== params.id,
    )
  },
}

export const RENAME_ENVIRONMENT_SCENE = 'environment-scene/rename'

export interface RenameEnvironmentSceneParams {
  id: string
  name: string
}

export function renameEnvironmentScene(
  id: string,
  name: string,
): Command<RenameEnvironmentSceneParams> {
  return {
    type: RENAME_ENVIRONMENT_SCENE,
    params: { id, name },
    description: 'Rename environment scene',
  }
}

const renameEnvironmentSceneHandler: CommandHandler<Project, RenameEnvironmentSceneParams> = {
  apply(state, params) {
    state.environmentScenes = (state.environmentScenes ?? []).map((scene) =>
      scene.id === params.id ? { ...scene, name: params.name } : scene,
    )
  },
}

export function registerEnvironmentSceneCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(ADD_ENVIRONMENT_SCENE, addEnvironmentSceneHandler)
    .register(REMOVE_ENVIRONMENT_SCENE, removeEnvironmentSceneHandler)
    .register(RENAME_ENVIRONMENT_SCENE, renameEnvironmentSceneHandler)
}
