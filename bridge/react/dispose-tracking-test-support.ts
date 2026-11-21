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
  const ofKind = (kind: ResourceKind): TrackedResource[] =>
    tracked.filter((entry) => entry.kind === kind)
  return {
    all: () => tracked,
    geometries: () => ofKind('geometry'),
    materials: () => ofKind('material'),
  }
}

/** The resources both trackers found, by identity. A disjoint pair means two builds share nothing. */
export function sharedResources(a: ResourceTracker, b: ResourceTracker): object[] {
  const inB = new Set(b.all().map((entry) => entry.resource))
  return a
    .all()
    .map((entry) => entry.resource)
    .filter((resource) => inB.has(resource))
}
