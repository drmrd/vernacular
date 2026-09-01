import { useEffect, useState } from 'react'

import { humanizeElementTypeId, type SceneGraph } from '../../core'

import { useAssetRegistry } from './asset-registry-context'

// A single, stable empty map instance so the first synchronous render (and every
// still-loading or failed-load render) returns the same reference, avoiding a
// needless re-render of memoized label consumers.
const EMPTY_CATALOG_NAMES: ReadonlyMap<string, string> = new Map()

// Assigns each item an ordinal within its own key's sequence (an opening's type, a stair's
// run type) rather than one shared sequence across every key, so a plan with two doors and
// one window numbers "Door 1", "Window 1", "Door 2" instead of grouping every kind under one
// running count. Shared by openingLabels and stairLabels, whose only difference is how they
// derive an item's id and key and how they render a key's humanized name into a label.
function perTypeOrdinalLabels<T>(
  items: readonly T[],
  toIdAndKey: (item: T) => readonly [string, string],
  labelOf: (key: string, ordinal: number) => string,
): (readonly [string, string])[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const [id, key] = toIdAndKey(item)
    const ordinal = (seen.get(key) ?? 0) + 1
    seen.set(key, ordinal)
    return [id, labelOf(key, ordinal)] as const
  })
}

// Labels the openings in graph order, numbering each within its own element-type
// sequence rather than one shared sequence, so a plan with two doors and one window
// reads "Single Swing Door 1", "Double Hung Window 1", "Single Swing Door 2" instead
// of grouping every opening kind under one running count.
function openingLabels(openings: SceneGraph['openings']): (readonly [string, string])[] {
  return perTypeOrdinalLabels(
    openings,
    (opening) => [opening.id, opening.type] as const,
    (type, ordinal) => `${humanizeElementTypeId(type)} ${ordinal}`,
  )
}

// Labels each stair within its own run-type sequence, the same per-type counter
// openingLabels uses, so a plan with two straight runs and one L-turn reads
// "Straight Stair 1", "L Turn Stair 1", "Straight Stair 2" rather than one shared count.
function stairLabels(stairs: SceneGraph['stairs']): (readonly [string, string])[] {
  return perTypeOrdinalLabels(
    stairs,
    (stair) => [stair.id, stair.runType] as const,
    (runType, ordinal) => `${humanizeElementTypeId(runType)} Stair ${ordinal}`,
  )
}

// Labels furniture in graph order: a piece's own name wins outright (and never consumes a
// catalog ordinal); otherwise an unnamed piece with a known asset hash gets its catalog name,
// numbered within that name via the same per-key counter openingLabels and stairLabels use;
// otherwise it falls back to its array position, unchanged by any catalog-labeled neighbors.
function furnitureLabels(
  furniture: SceneGraph['furniture'],
  catalogNames?: ReadonlyMap<string, string>,
): (readonly [string, string])[] {
  const seen = new Map<string, number>()
  return furniture.map((piece, index) => {
    if (piece.name !== undefined) return [piece.id, piece.name] as const
    const catalogName = catalogNames?.get(piece.assetRef.contentHash)
    if (catalogName === undefined) return [piece.id, `Furniture ${index + 1}`] as const
    const ordinal = (seen.get(catalogName) ?? 0) + 1
    seen.set(catalogName, ordinal)
    return [piece.id, `${catalogName} ${ordinal}`] as const
  })
}

// Resolves the asset registry's catalog into a contentHash -> display name map for
// furnitureLabels. Labels must render synchronously on first paint while the registry's
// list() (an async read, possibly over IndexedDB or a network pack) is still in flight, so
// this starts at the shared empty map and swaps in the settled catalog once it resolves,
// guarding against a stale resolve landing after unmount or after the registry itself changes.
export function useCatalogNames(): ReadonlyMap<string, string> {
  const registry = useAssetRegistry()
  const [catalogNames, setCatalogNames] = useState<ReadonlyMap<string, string>>(EMPTY_CATALOG_NAMES)
  useEffect(() => {
    let cancelled = false
    setCatalogNames(EMPTY_CATALOG_NAMES)
    registry
      .list()
      .then((items) => {
        if (cancelled) return
        setCatalogNames(new Map(items.map((item) => [item.reference.contentHash, item.name])))
      })
      .catch(() => {
        // Degrade to fallback labels rather than surfacing a load failure here.
      })
    return () => {
      cancelled = true
    }
  }, [registry])
  return catalogNames
}

// A short, stable label per selectable entity for the accessibility proxies, derived from
// the scene graph node kind and a per-kind index ("Wall 1", "Room 2"). Openings and stairs
// label from their own type instead of the generic kind, and furniture labels from its own
// name when the piece has one, else a catalog name (when supplied), else its position. Labels
// live in the bridge layer because the three-dimensional overlay cannot import the editor layer.
export function entityLabels(
  graph: SceneGraph,
  catalogNames?: ReadonlyMap<string, string>,
): Map<string, string> {
  return new Map<string, string>([
    ...graph.walls.map((wall, index) => [wall.id, `Wall ${index + 1}`] as const),
    ...graph.rooms.map((room, index) => [room.id, `Room ${index + 1}`] as const),
    ...openingLabels(graph.openings),
    ...furnitureLabels(graph.furniture, catalogNames),
    ...stairLabels(graph.stairs),
  ])
}
