import { createPlanPreview, type Project } from '../../core'
import {
  collectReferencedAssets,
  type ProjectLocation,
  type ProjectRecord,
  type SecondFileState,
} from '../../storage'

/** What a record takes from a document. */
export interface ProjectFacts {
  readonly name: string
  readonly floorCount: number
  readonly preview: string | undefined
  readonly assetHashes: readonly string[]
  /** False when the assets could not be listed. */
  readonly assetsListed: boolean
}

/** The drawing of the first floor, or undefined when it cannot be made. */
function previewOf(project: Project): string | undefined {
  try {
    return createPlanPreview(project)
  } catch {
    return undefined
  }
}

/**
 * Every distinct content hash of the referenced assets, sorted by code unit; undefined on a throw.
 */
export function assetHashesOf(project: Project): string[] | undefined {
  try {
    const hashes = collectReferencedAssets(project).map((reference) => reference.contentHash)
    return [...new Set(hashes)].sort()
  } catch {
    return undefined
  }
}

/** The facts of a document. Never throws: a part that cannot be made is left out. */
export function factsOf(project: Project): ProjectFacts {
  const assetHashes = assetHashesOf(project)
  return {
    name: project.meta.name,
    floorCount: project.floors.length,
    preview: previewOf(project),
    assetHashes: assetHashes ?? [],
    assetsListed: assetHashes !== undefined,
  }
}

/** What the record of an opened document holds besides the facts of that document. */
export interface OpenedRecordBasis {
  readonly id: string
  readonly location: ProjectLocation
  readonly build: string
  /** False when the stored document did not pass the check; its asset list is then not trusted. */
  readonly passedCheck: boolean
  readonly lastChangedAt: string | undefined
  readonly lastUsedAt: string | undefined
  readonly secondFile?: SecondFileState | undefined
}

/** The whole record of a document that this build opened, made from its facts. */
export function recordOfOpened(project: Project, basis: OpenedRecordBasis): ProjectRecord {
  const facts = factsOf(project)
  return {
    id: basis.id,
    location: basis.location,
    name: facts.name,
    floorCount: facts.floorCount,
    preview: facts.preview,
    assetHashes: facts.assetHashes,
    assetListComplete: facts.assetsListed && basis.passedCheck,
    lastChangedAt: basis.lastChangedAt,
    lastUsedAt: basis.lastUsedAt,
    lastOpen: { opened: true, build: basis.build },
    ...(basis.secondFile === undefined ? {} : { secondFile: basis.secondFile }),
  }
}
