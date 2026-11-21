import { expect } from 'vitest'

// Counts the 'dispose' events of every geometry, material, and texture reachable from a scene
// subtree, without importing three (bridge code and its tests stay off the renderer package).
// Resources are read structurally: an object with a `geometry` and a `material` (a mesh, line,
// or points) contributes both, and any texture held on a material property is tracked too.

type ResourceKind = 'geometry' | 'material' | 'texture'

interface Listenable {
  addEventListener(type: 'dispose', listener: () => void): void
}

interface Traversable {
  traverse(callback: (object: unknown) => void): void
}

/** One resource found under a root, with how many times it has been disposed since tracking began. */
export interface TrackedResource {
  readonly resource: object
  readonly kind: ResourceKind
  disposeCount: number
}

export interface ResourceTracker {
  /** Every distinct resource reachable from the root at the time of tracking. */
  all(): TrackedResource[]
  geometries(): TrackedResource[]
  materials(): TrackedResource[]
}

function isListenable(value: unknown): value is Listenable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Listenable>).addEventListener === 'function'
  )
}

function isTexture(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: unknown }).isTexture === true
  )
}

function texturesOf(material: object): object[] {
  return Object.values(material).filter(isTexture)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

function discover(root: unknown): Map<object, ResourceKind> {
  const found = new Map<object, ResourceKind>()
  const add = (candidate: unknown, kind: ResourceKind): void => {
    if (isListenable(candidate)) {
      found.set(candidate, kind)
    }
  }
  ;(root as Traversable).traverse((object) => {
    const owner = object as { geometry?: unknown; material?: unknown }
    if (owner.geometry === undefined || owner.material === undefined) {
      return
    }
    add(owner.geometry, 'geometry')
    for (const material of asList(owner.material)) {
      add(material, 'material')
      if (typeof material === 'object' && material !== null) {
        texturesOf(material).forEach((texture) => add(texture, 'texture'))
      }
    }
  })
  return found
}

function trackerOf(entries: TrackedResource[]): ResourceTracker {
  const ofKind = (kind: ResourceKind): TrackedResource[] =>
    entries.filter((entry) => entry.kind === kind)
  return {
    all: () => entries,
    geometries: () => ofKind('geometry'),
    materials: () => ofKind('material'),
  }
}

/** One tracker over the entries of several, so one assertion covers them all. */
export function mergedTrackers(trackers: ResourceTracker[]): ResourceTracker {
  return trackerOf(trackers.flatMap((tracker) => tracker.all()))
}

/** Starts counting dispose events on everything under `root` as it is now. */
export function trackResources(root: unknown): ResourceTracker {
  const tracked: TrackedResource[] = []
  for (const [resource, kind] of discover(root)) {
    const entry: TrackedResource = { resource, kind, disposeCount: 0 }
    ;(resource as Listenable).addEventListener('dispose', () => {
      entry.disposeCount += 1
    })
    tracked.push(entry)
  }
  return trackerOf(tracked)
}

/** The resources both trackers found, by identity. A disjoint pair means two builds share nothing. */
export function sharedResources(a: ResourceTracker, b: ResourceTracker): object[] {
  const inB = new Set(b.all().map((entry) => entry.resource))
  return a
    .all()
    .map((entry) => entry.resource)
    .filter((resource) => inB.has(resource))
}

/**
 * The tracker's entries that the other tracker did not find, by identity (a held template's
 * share is left out).
 */
export function without(tracker: ResourceTracker, excluded: ResourceTracker): ResourceTracker {
  const skipped = new Set(excluded.all().map((entry) => entry.resource))
  return trackerOf(tracker.all().filter((entry) => !skipped.has(entry.resource)))
}

/** How many tracked resources have not been disposed yet. */
export function liveOf(tracker: ResourceTracker): number {
  return tracker.all().filter((entry) => entry.disposeCount === 0).length
}

/** Asserts the tracker found something and every resource it found was disposed exactly once. */
export function expectEachDisposedOnce(tracker: ResourceTracker): void {
  expect(tracker.all().length).toBeGreaterThan(0)
  expect(tracker.all().map((entry) => entry.disposeCount)).toEqual(tracker.all().map(() => 1))
}

/** Asserts the tracker found something and none of it has been disposed. */
export function expectNoneDisposed(tracker: ResourceTracker): void {
  expect(tracker.all().length).toBeGreaterThan(0)
  expect(liveOf(tracker)).toBe(tracker.all().length)
}
