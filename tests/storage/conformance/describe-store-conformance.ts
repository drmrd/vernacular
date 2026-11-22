import { describe } from 'vitest'
import { runsOf } from './conformance-run'
import { describeFormatRules, describeVersionFixtures } from './migration-cases'
import { describeListing, describeManyProjects, describeSingleProject } from './placement-cases'
import { describeAssetDurability, describeSavePreservation } from './preservation-cases'
import { describeSecondDocumentFile, describeUnreadablePreviousFile } from './second-file-cases'
import type { StoreConformanceTarget } from './store-conformance-target'

export type {
  SingleProjectStoreTarget,
  StoreConformanceTarget,
  WorkspaceStoreTarget,
} from './store-conformance-target'

/**
 * The one suite that every kind of project store runs. It places raw document bytes through the
 * byte port under the store, and checks what the store does with them: opens every schema version,
 * keeps what it does not know, keeps assets, lists, and, by what the store holds, keeps projects
 * apart or leaves foreign files alone.
 */
export function describeStoreConformance(target: StoreConformanceTarget): void {
  describe(target.name, () => {
    const begin = runsOf(target)
    describeVersionFixtures(begin)
    describeSavePreservation(begin)
    describeSecondDocumentFile(begin, target.holdsMany)
    describeUnreadablePreviousFile(begin)
    describeAssetDurability(begin)
    describeListing(begin, target.holdsMany)
    describeFormatRules(begin)
    if (target.holdsMany) describeManyProjects(begin)
    else describeSingleProject(begin)
  })
}
