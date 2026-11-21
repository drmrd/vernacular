import { checkCurrentSchema } from '../format/current-schema'
import { checkModeFor, readRevision } from '../format/codec/revision'
import type { Project } from '../model/types'
import type { DataRemovingRepair } from './data-removing-repair'
import { DATA_REMOVING_REPAIRS } from './data-removing-repairs'

/** The repaired document, one sentence for each repair that applied, and what the repairs removed. */
export interface RepairOffer {
  readonly document: Project
  readonly sentences: readonly string[]
  /** JSON pointers, sorted in ascending code-unit order, without duplicates. */
  readonly removedPaths: readonly string[]
}

interface AppliedRepairs {
  readonly document: unknown
  readonly sentences: readonly string[]
  readonly removedPaths: ReadonlySet<string>
}

function isObjectWithMeta(document: unknown): document is { readonly meta: object } {
  if (typeof document !== 'object' || document === null || !('meta' in document)) {
    return false
  }
  return typeof document.meta === 'object' && document.meta !== null
}

// A newer build may define the fields that a repair would remove, so a repair there could lose data.
function isFromNewerBuild(document: { readonly meta: object }): boolean {
  return checkModeFor(readRevision(document as Project)) === 'tolerant'
}

function applyRepairs(
  document: unknown,
  repairs: readonly DataRemovingRepair[],
): AppliedRepairs | undefined {
  let applied: AppliedRepairs = { document, sentences: [], removedPaths: new Set() }
  for (const repair of repairs) {
    if (repair.recognizes(applied.document)) {
      const { document: repaired, removed } = repair.apply(applied.document)
      applied = {
        document: repaired,
        sentences: [...applied.sentences, repair.describe(removed)],
        removedPaths: new Set([...applied.removedPaths, ...removed]),
      }
    }
  }
  return applied.sentences.length === 0 ? undefined : applied
}

/**
 * Offers the data-removing repairs that turn a document that fails the format check into one that
 * passes it. Gives nothing when the value is no object, when no repair applies, when the repaired
 * document still fails the strict check, and when the document comes from a newer build. The input
 * is not changed.
 */
export function findRepairOffer(document: unknown): RepairOffer | undefined {
  if (!isObjectWithMeta(document) || isFromNewerBuild(document)) {
    return undefined
  }
  const applied = applyRepairs(document, DATA_REMOVING_REPAIRS)
  if (applied === undefined || checkCurrentSchema(applied.document, 'strict').length > 0) {
    return undefined
  }
  return {
    document: applied.document as Project,
    sentences: applied.sentences,
    removedPaths: [...applied.removedPaths].sort(),
  }
}
