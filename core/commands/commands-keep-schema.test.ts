import { describe, expect, it } from 'vitest'
import type { Command } from './command'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'
import { registerAllProjectCommands } from './handlers/register-all-project-commands'
import { COMMAND_SAMPLES } from './testing/command-samples'
import { PAINTED_SURFACE } from './testing/extensions-fixture'
import { schemaFixture } from './testing/schema-fixture'
import { checkCurrentSchema } from '../format/current-schema'
import { surfaceKey } from '../model/paint'
import type { Project } from '../model/types'

const MIXED_PAINT_COMMAND = 'test.mix-paint-entry'

function fullRegistry(): CommandRegistry<Project> {
  return registerAllProjectCommands(new CommandRegistry<Project>())
}

/** Dispatches a command to a fresh copy of the fixture and returns the changed copy. */
function applyToFixture(
  registry: CommandRegistry<Project>,
  command: (project: Project) => Command,
): Project {
  const project = structuredClone(schemaFixture())
  new Dispatcher<Project>(project, registry).dispatch(command(project))
  return project
}

/** Applies the sample command of `type` to a fresh copy of the fixture and returns the result. */
function resultOfSample(registry: CommandRegistry<Project>, type: string): Project {
  const sample = COMMAND_SAMPLES[type]
  if (sample === undefined) {
    throw new Error(`no sample parameters for the registered command ${type}`)
  }
  return applyToFixture(registry, (project) => ({
    type,
    params: sample(project),
    description: type,
  }))
}

/** A handler that gives a solid paint entry the field that only a pattern entry defines. */
function registryWithMixedPaintHandler(): CommandRegistry<Project> {
  return fullRegistry().register(MIXED_PAINT_COMMAND, {
    apply: (project: Project) => {
      const key = surfaceKey(PAINTED_SURFACE)
      const solid = project.paint?.[key]
      const mixed = Object.assign({}, solid, { patternId: 'plain' })
      project.paint = { ...project.paint, [key]: mixed }
    },
  })
}

describe('the schema fixture', () => {
  it('passes the strict check of the current schema', () => {
    expect(checkCurrentSchema(schemaFixture(), 'strict')).toEqual([])
  })
})

describe('the check after a command', () => {
  it('names a paint entry that carries a field of the other variant', () => {
    const result = applyToFixture(registryWithMixedPaintHandler(), () => ({
      type: MIXED_PAINT_COMMAND,
      params: undefined,
      description: 'mix a paint entry',
    }))

    const paths = checkCurrentSchema(result, 'strict').map((fault) => fault.path)

    expect(paths.some((path) => path.startsWith('/paint/'))).toBe(true)
  })

  it('runs on the document that a command changed', () => {
    const registry = fullRegistry()

    const changing = registry.types().filter((type) => {
      return JSON.stringify(resultOfSample(registry, type)) !== JSON.stringify(schemaFixture())
    })

    expect(changing.length).toBeGreaterThan(0)
  })
})

describe('every registered command', () => {
  it.each(fullRegistry().types())('%s leaves a document that passes the schema', (type) => {
    const result = resultOfSample(fullRegistry(), type)

    expect(checkCurrentSchema(result, 'strict')).toEqual([])
  })
})
