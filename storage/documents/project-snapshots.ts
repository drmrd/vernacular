import type { CodecOptions, DecodeResult, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { SnapshotStore } from '../snapshots/snapshot-store'

/** The recovery snapshots of one project, with the codec in front of the snapshot store. */
export interface ProjectSnapshots {
  /** Encodes the project through the codec and writes it as the newest snapshot. */
  writeSnapshot(project: Project): Promise<void>
  /** Removes the snapshot files and nothing else. */
  prune(): Promise<void>
  isRecoverable(): Promise<boolean>
  /** The codec's verdict on the newest snapshot; undefined when none exists. */
  restore(): Promise<DecodeResult | undefined>
}

/** The snapshots of the project whose directory is `directory`. */
export function createProjectSnapshots(
  directory: DirectoryPort,
  options?: CodecOptions,
): ProjectSnapshots {
  const store = new SnapshotStore(directory, options === undefined ? {} : { codec: options })
  return {
    writeSnapshot: (project) => store.writeSnapshot(project),
    prune: () => store.prune(),
    isRecoverable: () => store.isRecoverable(),
    restore: () => store.restoreDecoded(),
  }
}
