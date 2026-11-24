import { GROUND_GRASS_REFERENCE } from '../../core'
import { useAssetRegistry } from './asset-registry-context'
import { useGroundTexture } from './use-ground-texture'

/** Loads the starter pack grass texture the lawn plane draws. */
export function useGroundGrass() {
  return useGroundTexture(GROUND_GRASS_REFERENCE, useAssetRegistry())
}
