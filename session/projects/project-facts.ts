import { createPlanPreview, type Project } from '../../core'
import { collectReferencedAssets } from '../../storage'

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

/** Every distinct content hash of the referenced assets, sorted by code unit; undefined on a throw. */
function assetHashesOf(project: Project): string[] | undefined {
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
