import type { Dimension, Floor, Opening, Wall } from '../model/types'

export interface ClipboardSnapshot {
  walls: Wall[]
  openings: Opening[]
  dimensions: Dimension[]
}

/** Gathers the selected walls, the openings hosted on those walls, and the selected dimensions. */
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

function isClipboardEnvelope(value: unknown): value is ClipboardEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    candidate.kind === CLIPBOARD_KIND &&
    candidate.version === CLIPBOARD_VERSION &&
    typeof candidate.snapshot === 'object' &&
    candidate.snapshot !== null
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
