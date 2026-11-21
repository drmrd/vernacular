import { vi } from 'vitest'
import type { ProjectIndex } from '../storage'

/** Test support: an index whose reads of every record wait until the test lets them answer. */

/** Lets the held reads of an index answer. */
export type ReleaseReads = () => void

/**
 * Holds every later call of `index.all`: each one waits until the returned function runs, and then
 * answers what the index holds at that time.
 */
export function holdIndexReads(index: ProjectIndex): ReleaseReads {
  let release: ReleaseReads = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const realAll = index.all.bind(index)
  vi.spyOn(index, 'all').mockImplementation(async () => {
    await gate
    return realAll()
  })
  return () => release()
}
