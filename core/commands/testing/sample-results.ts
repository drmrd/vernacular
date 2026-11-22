// Helpers for the tests that run the sample parameters of every registered
// command type against a fixture document.

import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { registerAllProjectCommands } from '../handlers/register-all-project-commands'
import type { Project } from '../../model/types'
import { COMMAND_SAMPLES } from './command-samples'
import { schemaFixture } from './schema-fixture'

/** A registry holding every project command. */
export function fullRegistry(): CommandRegistry<Project> {
  return registerAllProjectCommands(new CommandRegistry<Project>())
}

/** Dispatches the sample command of `type` to `project`, built from `project`, in place. */
export function dispatchSample(
  project: Project,
  type: string,
  registry: CommandRegistry<Project> = fullRegistry(),
): void {
  const sample = COMMAND_SAMPLES[type]
  if (sample === undefined) {
    throw new Error(`no sample parameters for the registered command ${type}`)
  }
  new Dispatcher<Project>(project, registry).dispatch({
    type,
    params: sample(project),
    description: type,
  })
}

/** Applies the sample command of `type` to a fresh copy of the schema fixture and returns the result. */
export function resultOfSample(registry: CommandRegistry<Project>, type: string): Project {
  const project = structuredClone(schemaFixture())
  dispatchSample(project, type, registry)
  return project
}
