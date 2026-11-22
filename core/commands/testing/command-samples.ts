// Sample parameters for every registered command type, built against the ids
// of the extensions fixture. The test that every command keeps `extensions`
// fails for a registered type that has no entry here.

import type { Project } from '../../model/types'
import { FIXTURE_IDS } from './extensions-fixture'
import { FLOOR_COMMAND_SAMPLES } from './floor-command-samples'
import { PROJECT_COMMAND_SAMPLES } from './project-command-samples'

/** The parameters of each command type, built from a fixture document and keyed by command type. */
export const COMMAND_SAMPLES: Record<string, (project: Project) => unknown> = {
  ...PROJECT_COMMAND_SAMPLES,
  ...FLOOR_COMMAND_SAMPLES,
  ['project/mark-main-entrance']: () => ({
    floorId: FIXTURE_IDS.groundFloor,
    openingId: FIXTURE_IDS.sideOpening,
  }),
  ['project/clear-main-entrance']: () => ({}),
}
