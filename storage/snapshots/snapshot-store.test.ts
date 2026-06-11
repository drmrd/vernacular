// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { describe, expect, it } from 'vitest'
import { createEmptyProject, type Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { SnapshotStore } from './snapshot-store'

const AUTOSAVE_DIRECTORY = '.house-autosave'

function projectNamed(name: string): Project {
  const project = createEmptyProject({
    name: 'Snap',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.meta.name = name
  return project
}

/** A `now` that returns each supplied timestamp in turn across successive calls. */
function clockReturning(...timestamps: number[]): () => number {
  let index = 0
  return () => {
    const timestamp = timestamps[index]
    if (timestamp === undefined) {
      throw new Error(
        `clock called ${index + 1} times but only ${timestamps.length} timestamps given`,
      )
    }
    index += 1
    return timestamp
  }
}

describe('SnapshotStore', () => {
  it('keeps the session-start snapshot and caps rolling snapshots to maxSnapshots', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, {
      maxSnapshots: 5,
      now: clockReturning(1, 2, 3, 4, 5, 6),
    })

    for (let write = 0; write < 6; write += 1) {
      await store.writeSnapshot(projectNamed('Snap'))
    }

    const entries = await directory.list(AUTOSAVE_DIRECTORY)

    expect(new Set(entries)).toEqual(
      new Set([
        'session-start.json',
        'snapshot-2.json',
        'snapshot-3.json',
        'snapshot-4.json',
        'snapshot-5.json',
        'snapshot-6.json',
      ]),
    )
    expect(entries).not.toContain('snapshot-1.json')
  })

  it('restores the newest rolling snapshot', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1, 2) })

    await store.writeSnapshot(projectNamed('A'))
    await store.writeSnapshot(projectNamed('B'))

    expect(await store.restore()).toEqual(projectNamed('B'))
  })

  it('restores nothing on a fresh store', async () => {
    const store = new SnapshotStore(new InMemoryDirectory())

    expect(await store.restore()).toBeUndefined()
  })

  it('reports recoverability only once a rolling snapshot exists', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1) })

    expect(await store.isRecoverable()).toBe(false)

    await store.writeSnapshot(projectNamed('Snap'))

    expect(await store.isRecoverable()).toBe(true)
  })

  it('clears every snapshot when pruned', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1, 2) })
    await store.writeSnapshot(projectNamed('A'))
    await store.writeSnapshot(projectNamed('B'))

    await store.prune()

    expect(await store.restore()).toBeUndefined()
    expect(await store.isRecoverable()).toBe(false)
    expect(await directory.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })
})
