import { describe, it, expect } from 'vitest'
import { setRoomName, registerRoomCommands } from './room-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { Project } from '../../model/types'

const TARGET_KEY = 'room:wall-a|wall-b'
const SIBLING_KEY = 'room:wall-c|wall-d'
const SIBLING_NAME = 'Parlor'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerRoomCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setRoomName', () => {
  it('creates the overrides map and entry when none exists', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
  })

  it('renames a room while leaving a sibling override untouched', () => {
    const project = newProject()
    project.roomOverrides = {
      [TARGET_KEY]: { name: 'Kitchen' },
      [SIBLING_KEY]: { name: SIBLING_NAME },
    }
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Scullery'))

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Scullery')
    expect(project.roomOverrides?.[SIBLING_KEY]?.name).toBe(SIBLING_NAME)
  })

  it('restores absent overrides on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Kitchen'))

    dispatcher.undo()

    expect(project.roomOverrides).toBeUndefined()
  })

  it('restores the prior name on undo when an override existed before', () => {
    const project = newProject()
    project.roomOverrides = { [TARGET_KEY]: { name: 'Kitchen' } }
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setRoomName(TARGET_KEY, 'Scullery'))

    dispatcher.undo()

    expect(project.roomOverrides?.[TARGET_KEY]?.name).toBe('Kitchen')
  })
})
