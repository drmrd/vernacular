import { describe, it, expect } from 'vitest'
import { placeUnderlay, registerUnderlayCommands, PLACE_UNDERLAY } from './underlay-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createUnderlay } from '../../model/factories'
import type { AssetReference } from '../../model/asset-reference'
import type { Project, Underlay } from '../../model/types'

const IMAGE: AssetReference = { scope: 'project', contentHash: 'deadbeef' }
const UNDERLAY_WIDTH = 1024
const UNDERLAY_HEIGHT = 768

function newUnderlay(): Underlay {
  return createUnderlay({ image: IMAGE, width: UNDERLAY_WIDTH, height: UNDERLAY_HEIGHT })
}

function projectWithTwoFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: 'g' }), createFloor('Upper', { id: 'u' })]
  return project
}

function dispatcherFor(project: Project): Dispatcher<Project> {
  const registry = new CommandRegistry<Project>()
  registerUnderlayCommands(registry)
  return new Dispatcher<Project>(project, registry)
}

describe('placeUnderlay', () => {
  it('appends the underlay to the target floor', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const underlay = newUnderlay()

    dispatcher.dispatch(placeUnderlay('g', underlay))

    expect(project.floors[0]?.underlays).toEqual([underlay])
  })

  it('leaves the target floor walls and the sibling floor untouched', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)

    dispatcher.dispatch(placeUnderlay('g', newUnderlay()))

    expect(project.floors[0]?.walls).toHaveLength(0)
    expect(project.floors[1]?.underlays).toHaveLength(0)
  })

  it('removes the appended underlay on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    dispatcher.dispatch(placeUnderlay('g', newUnderlay()))

    dispatcher.undo()

    expect(project.floors[0]?.underlays).toEqual([])
  })

  it('carries a stable command type', () => {
    expect(placeUnderlay('g', newUnderlay()).type).toBe(PLACE_UNDERLAY)
  })
})
