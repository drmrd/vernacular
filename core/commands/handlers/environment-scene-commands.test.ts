import { describe, expect, it } from 'vitest'
import {
  addEnvironmentScene,
  registerEnvironmentSceneCommands,
  removeEnvironmentScene,
  renameEnvironmentScene,
} from './environment-scene-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { EnvironmentScene } from '../../model/environment-scene'
import type { Project } from '../../model/types'

const NOON: EnvironmentScene = {
  id: 'scene-1',
  name: 'Summer noon',
  observedAt: '2026-06-21T12:00',
}

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerEnvironmentSceneCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('addEnvironmentScene', () => {
  it('appends a scene', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(addEnvironmentScene(NOON))
    expect(project.environmentScenes).toEqual([NOON])
  })

  it('restores the prior array on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.undo()
    expect(project.environmentScenes).toEqual([])
  })
})

describe('removeEnvironmentScene', () => {
  it('drops a scene by id and leaves an empty array', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(removeEnvironmentScene('scene-1'))
    expect(project.environmentScenes).toEqual([])
  })

  it('restores the removed scene on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(removeEnvironmentScene('scene-1'))
    dispatcher.undo()
    expect(project.environmentScenes).toEqual([NOON])
  })
})

describe('renameEnvironmentScene', () => {
  it('renames a scene by id', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(renameEnvironmentScene('scene-1', 'Summer midday'))
    expect(project.environmentScenes?.[0]?.name).toBe('Summer midday')
  })

  it('restores the prior name on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addEnvironmentScene(NOON))
    dispatcher.dispatch(renameEnvironmentScene('scene-1', 'Summer midday'))
    dispatcher.undo()
    expect(project.environmentScenes?.[0]?.name).toBe('Summer noon')
  })
})
