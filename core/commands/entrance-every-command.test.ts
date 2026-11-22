import { describe, expect, it } from 'vitest'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'
import { countMarkedDoors } from './entrance-rule'
import { registerAllProjectCommands } from './handlers/register-all-project-commands'
import { COMMAND_SAMPLES } from './testing/command-samples'
import { FIXTURE_IDS } from './testing/extensions-fixture'
import { schemaFixture } from './testing/schema-fixture'
import { createEmptyProject, createFloor, createOpening, createWall } from '../model/factories'
import type { Opening, Project } from '../model/types'

const HOST_WALL_ID = 'wall-1'
const WALL_LENGTH_MM = 8000
const POSITION_STEP_MM = 1000
const DOOR_TYPE = 'single-swing-door'
const WINDOW_TYPE = 'double-hung-window'

function fullRegistry(): CommandRegistry<Project> {
  return registerAllProjectCommands(new CommandRegistry<Project>())
}

function allOpenings(project: Project): Opening[] {
  return project.floors.flatMap((floor) => floor.openings)
}

/** A project whose ground floor holds the given openings, in order, along one wall. */
function projectWith(specs: ReadonlyArray<{ type: string; entrance?: true }>): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: HOST_WALL_ID })
  const openings = specs.map((spec, index) => {
    const position = (index + 1) * POSITION_STEP_MM
    const created = createOpening({
      type: spec.type,
      hostWallId: HOST_WALL_ID,
      position,
      id: `opening-${index}`,
    })
    return spec.entrance === undefined ? created : { ...created, entrance: spec.entrance }
  })
  project.floors = [{ ...createFloor('Ground', { id: 'ground', walls: [wall] }), openings }]
  return project
}

/** Applies the sample command of `type` to a fresh copy of the fixture. */
function resultOfSample(registry: CommandRegistry<Project>, type: string): Project {
  const sample = COMMAND_SAMPLES[type]
  if (sample === undefined) {
    throw new Error(`no sample parameters for the registered command ${type}`)
  }
  const project = schemaFixture()
  new Dispatcher<Project>(project, registry).dispatch({
    type,
    params: sample(project),
    description: type,
  })
  return project
}

describe('countMarkedDoors', () => {
  it('counts no door in a project with no mark', () => {
    expect(countMarkedDoors(projectWith([{ type: DOOR_TYPE }, { type: WINDOW_TYPE }]))).toBe(0)
  })

  it('counts the one marked door', () => {
    const project = projectWith([{ type: DOOR_TYPE, entrance: true }, { type: DOOR_TYPE }])

    expect(countMarkedDoors(project)).toBe(1)
  })

  it('counts every marked door when a file carries more than one', () => {
    const project = projectWith([
      { type: DOOR_TYPE, entrance: true },
      { type: DOOR_TYPE, entrance: true },
    ])

    expect(countMarkedDoors(project)).toBe(2)
  })

  it('does not count a marked window', () => {
    const project = projectWith([{ type: WINDOW_TYPE, entrance: true }, { type: DOOR_TYPE }])

    expect(countMarkedDoors(project)).toBe(0)
  })

  it('counts marked doors on every floor', () => {
    const project = projectWith([{ type: DOOR_TYPE, entrance: true }])
    const upper = createFloor('Upper', { id: 'upper' })
    const upstairs = createOpening({ type: DOOR_TYPE, hostWallId: 'none', position: 0, id: 'up' })
    project.floors.push({ ...upper, openings: [{ ...upstairs, entrance: true }] })

    expect(countMarkedDoors(project)).toBe(2)
  })
})

describe('the extensions fixture', () => {
  it('starts with exactly one marked door, the main opening', () => {
    const fixture = schemaFixture()

    const marked = allOpenings(fixture).filter((opening) => opening.entrance === true)

    expect(marked.map((opening) => opening.id)).toEqual([FIXTURE_IDS.mainOpening])
    expect(countMarkedDoors(fixture)).toBe(1)
  })
})

describe('every registered command', () => {
  it.each(fullRegistry().types())('%s leaves at most one marked door', (type) => {
    const result = resultOfSample(fullRegistry(), type)

    expect(countMarkedDoors(result)).toBeLessThanOrEqual(1)
  })

  it.each(fullRegistry().types())('%s leaves the mark on doors only', (type) => {
    const result = resultOfSample(fullRegistry(), type)

    const withKey = allOpenings(result).filter((opening) => 'entrance' in opening)

    expect(withKey).toHaveLength(countMarkedDoors(result))
  })
})
