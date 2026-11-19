import type { AssetCache } from '../../storage'
import { internalsOf } from './handle-internals'
import type { DocumentHandle } from './handle-types'

/**
 * The asset cache of the project that the handle holds: the shared pool for a workspace project,
 * and the folder's cache, which reads the folder first, for a folder project. Throws for an object
 * that no open built.
 */
export function assetsOf(handle: DocumentHandle): AssetCache {
  return internalsOf(handle).store.assets(handle.id)
}
