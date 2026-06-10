import { describe, expect, it } from 'vitest'
import {
  addPaletteColor,
  createProjectPalette,
  registerPaletteCommands,
  renameProjectPalette,
} from './palette-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import { colorFromHex } from '../../color/color'
import type { Project } from '../../model/types'

const PALETTE_ID = 'palette-1'

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
  registerPaletteCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('createProjectPalette', () => {
  it('adds a named project-local palette', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    expect(project.palettes?.[0]).toMatchObject({ id: PALETTE_ID, name: 'My Palette', colors: [] })
  })

  it('restores absent palettes on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    dispatcher.undo()
    expect(project.palettes).toBeUndefined()
  })
})

describe('addPaletteColor', () => {
  it('appends a named color to a project-local palette', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'My Palette' }))
    dispatcher.dispatch(
      addPaletteColor(PALETTE_ID, { name: 'Sage', color: colorFromHex('#9aa583') }),
    )
    expect(project.palettes?.[0]?.colors[0]).toMatchObject({ name: 'Sage' })
  })
})

describe('renameProjectPalette', () => {
  it('renames a palette while leaving its colors intact', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(createProjectPalette({ id: PALETTE_ID, name: 'Old' }))
    dispatcher.dispatch(
      addPaletteColor(PALETTE_ID, { name: 'Sage', color: colorFromHex('#9aa583') }),
    )
    dispatcher.dispatch(renameProjectPalette(PALETTE_ID, 'New'))
    expect(project.palettes?.[0]?.name).toBe('New')
    expect(project.palettes?.[0]?.colors).toHaveLength(1)
  })
})
