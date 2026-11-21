import type { GpuResource } from './dispose-object'

/** Counts the 'dispose' events three.js dispatches on each resource from now on. */
export function countFrees(resources: GpuResource[]): Map<GpuResource, number> {
  const counts = new Map<GpuResource, number>()
  for (const resource of resources) {
    counts.set(resource, 0)
    resource.addEventListener('dispose', () => {
      counts.set(resource, (counts.get(resource) ?? 0) + 1)
    })
  }
  return counts
}

/** The total of a countFrees map, for checks that nothing (or everything) was freed. */
export function totalFrees(counts: Map<GpuResource, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, 0)
}
