import { describe, expect, it } from 'vitest'
import {
  CLEAR_OPENING_LIGHT,
  SET_OPENING_LIGHT,
  clearOpeningLight,
  registerOpeningLightCommands,
  setOpeningLight,
} from './opening-light-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import type { OpeningLight } from '../../model/environment-scene'
import type { Project } from '../../model/types'

const SUMMER_MORNING_CLOUD_COVER = 0.4
const SUMMER_MORNING = {
  observedAt: '2026-06-21T08:00',
  weather: { cloudCover: SUMMER_MORNING_CLOUD_COVER },
}
const EXTENSION_NAMESPACE = 'com.example'
const RAINY_CLOUD_COVER = 0.9
const WINTER_RAIN: OpeningLight = {
  observedAt: '2026-01-05T09:15',
  weather: { cloudCover: RAINY_CLOUD_COVER, summary: 'Rain' },
  extensions: { [EXTENSION_NAMESPACE]: { note: 'kept' } },
}

function newProject(openingLight?: OpeningLight): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  if (openingLight !== undefined) project.openingLight = structuredClone(openingLight)
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerOpeningLightCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('setOpeningLight', () => {
  it('stores the light on a project that has none', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(setOpeningLight(SUMMER_MORNING))
    expect(project.openingLight).toEqual(SUMMER_MORNING)
  })

  it('replaces the time and the weather and keeps the extensions of the light it replaces', () => {
    const project = newProject(WINTER_RAIN)
    dispatcherFor(project).dispatch(setOpeningLight(SUMMER_MORNING))
    expect(project.openingLight).toEqual({
      ...SUMMER_MORNING,
      extensions: WINTER_RAIN.extensions,
    })
  })

  it('leaves no weather key when the new light has no weather', () => {
    const project = newProject(WINTER_RAIN)
    dispatcherFor(project).dispatch(setOpeningLight({ observedAt: SUMMER_MORNING.observedAt }))
    expect('weather' in project.openingLight!).toBe(false)
    expect(project.openingLight?.extensions).toEqual(WINTER_RAIN.extensions)
  })

  it('removes the light on undo when there was none before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setOpeningLight(SUMMER_MORNING))
    dispatcher.undo()
    expect('openingLight' in project).toBe(false)
  })

  it('restores the replaced light, extensions included, on undo in one step', () => {
    const project = newProject(WINTER_RAIN)
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(setOpeningLight(SUMMER_MORNING))
    dispatcher.undo()
    expect(project.openingLight).toEqual(WINTER_RAIN)
    expect(dispatcher.canUndo()).toBe(false)
  })

  it('carries its type and history description', () => {
    const command = setOpeningLight(SUMMER_MORNING)
    expect(command.type).toBe('opening-light/set')
    expect(command.type).toBe(SET_OPENING_LIGHT)
    expect(command.description).toBe('Set opening light')
  })
})

describe('clearOpeningLight', () => {
  it('removes the light key from the project', () => {
    const project = newProject(WINTER_RAIN)
    dispatcherFor(project).dispatch(clearOpeningLight())
    expect('openingLight' in project).toBe(false)
  })

  it('changes nothing and does not throw on a project with no light', () => {
    const project = newProject()
    expect(() => dispatcherFor(project).dispatch(clearOpeningLight())).not.toThrow()
    expect('openingLight' in project).toBe(false)
  })

  it('restores the light on undo in one step', () => {
    const project = newProject(WINTER_RAIN)
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(clearOpeningLight())
    dispatcher.undo()
    expect(project.openingLight).toEqual(WINTER_RAIN)
    expect(dispatcher.canUndo()).toBe(false)
  })

  it('carries its type and history description', () => {
    const command = clearOpeningLight()
    expect(command.type).toBe('opening-light/clear')
    expect(command.type).toBe(CLEAR_OPENING_LIGHT)
    expect(command.description).toBe('Clear opening light')
  })
})
