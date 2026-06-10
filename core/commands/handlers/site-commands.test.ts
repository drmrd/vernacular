import { describe, expect, it } from 'vitest'
import {
  addObstruction,
  registerSiteCommands,
  removeObstruction,
  setSiteLocation,
  setSiteNorthBearing,
} from './site-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { Obstruction } from '../../model/site'
import type { Project } from '../../model/types'

const OBSTRUCTION: Obstruction = {
  id: 'tree-1',
  footprint: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
  ],
  height: 6000,
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
  registerSiteCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setSiteLocation', () => {
  it('records a lat/long', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setSiteLocation({ latitude: 42.36, longitude: -71.06 }))
    expect(project.site?.latLong).toEqual({ latitude: 42.36, longitude: -71.06 })
  })

  it('restores an absent site on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setSiteLocation({ latitude: 42.36, longitude: -71.06 }))
    dispatcher.undo()
    expect(project.site).toBeUndefined()
  })
})

describe('setSiteNorthBearing', () => {
  it('records the north bearing in radians', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setSiteNorthBearing(0.5))
    expect(project.site?.northBearing).toBe(0.5)
  })
})

describe('addObstruction', () => {
  it('appends a top-down massing obstruction', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(addObstruction(OBSTRUCTION))
    expect(project.site?.obstructions?.[0]).toEqual(OBSTRUCTION)
  })

  it('removes a named obstruction', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(addObstruction(OBSTRUCTION))
    dispatcher.dispatch(removeObstruction('tree-1'))
    expect(project.site?.obstructions ?? []).toHaveLength(0)
  })
})
