import type { AssetReference, Project, UnderlaySource } from '../../core'

function underlayAssetRef(source: UnderlaySource): AssetReference {
  if (source.kind === 'raster') {
    return source.image
  }
  if (source.kind === 'document') {
    return source.document
  }
  return source.scene
}

/** Every AssetReference the document references: placed furniture and underlay sources. */
export function collectReferencedAssets(project: Project): AssetReference[] {
  const references: AssetReference[] = []
  for (const floor of project.floors) {
    for (const item of floor.furniture) {
      references.push(item.assetRef)
    }
    for (const underlay of floor.underlays) {
      references.push(underlayAssetRef(underlay.source))
    }
  }
  return references
}
