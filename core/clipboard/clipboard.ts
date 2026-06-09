import { translatePoint } from '../geometry/point'
import type { Dimension, Floor, Opening, Point, Wall } from '../model/types'

export interface ClipboardSnapshot {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}

/**
 * Gathers the selected walls and dimensions. An opening is included only when its host wall is
 * also selected, because an opening without its host wall cannot be re-hosted on paste.
 */
export function buildClipboardSnapshot(
  floor: Floor,
  entityIds: Iterable<string>,
): ClipboardSnapshot {
  const selectedIds = new Set(entityIds)
  const walls = floor.walls.filter((wall) => selectedIds.has(wall.id))
  const selectedWallIds = new Set(walls.map((wall) => wall.id))
  const openings = floor.openings.filter((opening) => selectedWallIds.has(opening.hostWallId))
  const dimensions = floor.dimensions.filter((dimension) => selectedIds.has(dimension.id))
  return { walls, openings, dimensions }
}

const CLIPBOARD_KIND = 'vernacular/clipboard'
const CLIPBOARD_VERSION = 1

interface ClipboardEnvelope {
  kind: typeof CLIPBOARD_KIND
  version: typeof CLIPBOARD_VERSION
  snapshot: ClipboardSnapshot
}

function isClipboardSnapshot(value: unknown): value is ClipboardSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    Array.isArray(candidate.walls) &&
    Array.isArray(candidate.openings) &&
    Array.isArray(candidate.dimensions)
  )
}

function isClipboardEnvelope(value: unknown): value is ClipboardEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    candidate.kind === CLIPBOARD_KIND &&
    candidate.version === CLIPBOARD_VERSION &&
    isClipboardSnapshot(candidate.snapshot)
  )
}

/** Serializes a clipboard snapshot into a versioned, kind-tagged JSON envelope. */
export function serializeClipboard(snapshot: ClipboardSnapshot): string {
  return JSON.stringify({ kind: CLIPBOARD_KIND, version: CLIPBOARD_VERSION, snapshot })
}

/** Parses a clipboard envelope, returning its snapshot or undefined when the payload is invalid. */
export function deserializeClipboard(text: string): ClipboardSnapshot | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isClipboardEnvelope(parsed)) {
    return undefined
  }
  return parsed.snapshot
}

export interface InstantiatedEntities {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
  /** The new id of every instantiated entity (walls, then openings, then dimensions), with no duplicates. */
  ids: string[]
}

function cloneWalls(
  walls: Wall[],
  offset: Point,
  mint: () => string,
): [Wall[], Map<string, string>] {
  const idByOldWallId = new Map<string, string>()
  const cloned = walls.map((wall) => {
    const id = mint()
    idByOldWallId.set(wall.id, id)
    return {
      ...wall,
      id,
      start: translatePoint(wall.start, offset),
      end: translatePoint(wall.end, offset),
    }
  })
  return [cloned, idByOldWallId]
}

function cloneOpenings(
  openings: Opening[],
  idByOldWallId: Map<string, string>,
  mint: () => string,
): Opening[] {
  const cloned: Opening[] = []
  for (const opening of openings) {
    const hostWallId = idByOldWallId.get(opening.hostWallId)
    if (hostWallId === undefined) {
      continue
    }
    cloned.push({ ...opening, id: mint(), hostWallId })
  }
  return cloned
}

function cloneDimensions(dimensions: Dimension[], offset: Point, mint: () => string): Dimension[] {
  return dimensions.map((dimension) => ({
    ...dimension,
    id: mint(),
    start: translatePoint(dimension.start, offset),
    end: translatePoint(dimension.end, offset),
  }))
}

/**
 * Clones a snapshot's entities with fresh ids, offsetting geometry and remapping opening host walls.
 * An opening is instantiated only when its host wall is part of the snapshot, because an opening
 * whose host wall was not copied has no wall to be re-hosted on.
 */
export function instantiateClipboard(
  snapshot: ClipboardSnapshot,
  offset: Point,
  mintId: () => string = () => globalThis.crypto.randomUUID(),
): InstantiatedEntities {
  const [walls, idByOldWallId] = cloneWalls(snapshot.walls, offset, mintId)
  const openings = cloneOpenings(snapshot.openings, idByOldWallId, mintId)
  const dimensions = cloneDimensions(snapshot.dimensions, offset, mintId)
  const ids = [...walls, ...openings, ...dimensions].map((entity) => entity.id)
  return { walls, openings, dimensions, ids }
}
