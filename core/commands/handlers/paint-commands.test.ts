import { describe, expect, it } from 'vitest'
import { assignSurfacePaint, clearSurfacePaint, registerPaintCommands } from './paint-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject } from '../../model/factories'
import { surfaceKey, type SurfaceRef } from '../../model/paint'
import { colorFromHex } from '../../color/color'
import type { Project } from '../../model/types'

const REF: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const SAGE = colorFromHex('#9aa583')

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
  registerPaintCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('assignSurfacePaint', () => {
  it('paints a wall face with a color and finish', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    expect(project.paint?.[surfaceKey(REF)]).toEqual({ color: SAGE, finishId: 'satin' })
  })

  it('defaults the finish to matte when none is given', () => {
    const project = newProject()
    dispatcherFor(project).dispatch(assignSurfacePaint(REF, SAGE))
    expect(project.paint?.[surfaceKey(REF)]?.finishId).toBe('matte')
  })

  it('restores absent paint on undo when none existed before', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    dispatcher.undo()
    expect(project.paint).toBeUndefined()
  })
})

describe('clearSurfacePaint', () => {
  it('removes a surface assignment and restores it on undo', () => {
    const project = newProject()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(assignSurfacePaint(REF, SAGE, 'satin'))
    dispatcher.dispatch(clearSurfacePaint(REF))
    expect(project.paint?.[surfaceKey(REF)]).toBeUndefined()
    dispatcher.undo()
    expect(project.paint?.[surfaceKey(REF)]).toEqual({ color: SAGE, finishId: 'satin' })
  })
})
