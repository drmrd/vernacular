import { describe, it, expect } from 'vitest'
import {
  placeUnderlay,
  calibrateUnderlay,
  removeUnderlay,
  registerUnderlayCommands,
  PLACE_UNDERLAY,
  CALIBRATE_UNDERLAY,
  REMOVE_UNDERLAY,
} from './underlay-commands'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { createEmptyProject, createFloor, createUnderlay } from '../../model/factories'
import type { AssetReference } from '../../model/asset-reference'
import type { Project, Underlay, UnderlayPlacement } from '../../model/types'

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

const NEW_PLACEMENT: UnderlayPlacement = {
  offset: { x: 50, y: 60 },
  millimetersPerPixel: 12.5,
  rotation: 0,
}

describe('calibrateUnderlay', () => {
  it('replaces the target underlay placement with the calibrated placement', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', target))

    dispatcher.dispatch(calibrateUnderlay('g', target.id, NEW_PLACEMENT))

    expect(project.floors[0]?.underlays[0]?.placement).toEqual(NEW_PLACEMENT)
  })

  it('leaves the target underlay other fields and a sibling underlay untouched', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newUnderlay()
    const sibling = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', target))
    dispatcher.dispatch(placeUnderlay('g', sibling))

    dispatcher.dispatch(calibrateUnderlay('g', target.id, NEW_PLACEMENT))

    const calibrated = project.floors[0]?.underlays[0]
    expect(calibrated?.image).toEqual(target.image)
    expect(calibrated?.width).toBe(target.width)
    expect(calibrated?.height).toBe(target.height)
    expect(calibrated?.opacity).toBe(target.opacity)
    expect(calibrated?.visible).toBe(target.visible)
    expect(project.floors[0]?.underlays[1]).toEqual(sibling)
  })

  it('restores the previous placement on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', target))
    const originalPlacement = target.placement

    dispatcher.dispatch(calibrateUnderlay('g', target.id, NEW_PLACEMENT))
    dispatcher.undo()

    expect(project.floors[0]?.underlays[0]?.placement).toEqual(originalPlacement)
  })

  it('carries a stable command type', () => {
    expect(calibrateUnderlay('g', 'underlay-1', NEW_PLACEMENT).type).toBe(CALIBRATE_UNDERLAY)
  })
})

describe('removeUnderlay', () => {
  it('removes the target underlay while a sibling underlay remains', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newUnderlay()
    const sibling = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', target))
    dispatcher.dispatch(placeUnderlay('g', sibling))

    dispatcher.dispatch(removeUnderlay('g', target.id))

    expect(project.floors[0]?.underlays).toEqual([sibling])
  })

  it('leaves the target floor walls and the sibling floor untouched', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const target = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', target))

    dispatcher.dispatch(removeUnderlay('g', target.id))

    expect(project.floors[0]?.walls).toHaveLength(0)
    expect(project.floors[1]?.underlays).toHaveLength(0)
  })

  it('restores the removed underlay at its original index on undo', () => {
    const project = projectWithTwoFloors()
    const dispatcher = dispatcherFor(project)
    const first = newUnderlay()
    const middle = newUnderlay()
    const last = newUnderlay()
    dispatcher.dispatch(placeUnderlay('g', first))
    dispatcher.dispatch(placeUnderlay('g', middle))
    dispatcher.dispatch(placeUnderlay('g', last))

    dispatcher.dispatch(removeUnderlay('g', middle.id))
    dispatcher.undo()

    expect(project.floors[0]?.underlays).toEqual([first, middle, last])
  })

  it('carries a stable command type', () => {
    expect(removeUnderlay('g', 'underlay-1').type).toBe(REMOVE_UNDERLAY)
  })
})
