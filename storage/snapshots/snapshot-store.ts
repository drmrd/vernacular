import { decodeDocument } from '../../core'
import type { CodecOptions, DecodeResult, Project } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { encodeForWrite, openDecodedDocument } from '../documents/open-decoded'
import { setAsideRefusedSnapshots } from './set-aside-refused'

/**
 * The directory of recovery snapshots, a sidecar of the document. An export and an import leave
 * it out; only the unchecked copy of a project that did not open carries it.
 */
export const AUTOSAVE_DIRECTORY = '.house-autosave'
const SESSION_START_FILE = 'session-start.json'
const SNAPSHOT_PREFIX = 'snapshot-'
const SNAPSHOT_SUFFIX = '.json'
const DEFAULT_MAX_SNAPSHOTS = 5

export interface SnapshotStoreOptions {
  /** Rolling snapshots kept besides the session-start snapshot. Default 5. */
  maxSnapshots?: number
  /** Injected for deterministic snapshot timestamps. Default Date.now. */
  now?: () => number
  /** Handed to the codec on every write and read of a snapshot. */
  codec?: CodecOptions
}

/**
 * Writes crash-recovery snapshots into a sidecar autosave directory: one
 * session-start snapshot plus a capped, rolling series of timestamped snapshots.
 */
export class SnapshotStore {
  private readonly maxSnapshots: number
  private readonly now: () => number
  private readonly codec: CodecOptions

  constructor(
    private readonly directory: DirectoryPort,
    options?: SnapshotStoreOptions,
  ) {
    this.maxSnapshots = options?.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    this.now = options?.now ?? Date.now
    this.codec = options?.codec ?? {}
  }

  async writeSnapshot(project: Project): Promise<void> {
    const bytes = encodeForWrite(project, undefined, this.codec)
    await this.ensureSessionStart(bytes)
    await this.directory.writeFile(
      `${AUTOSAVE_DIRECTORY}/${SNAPSHOT_PREFIX}${this.now()}${SNAPSHOT_SUFFIX}`,
      bytes,
    )
    await this.pruneOldestRollingSnapshots()
  }

  private async ensureSessionStart(bytes: Uint8Array): Promise<void> {
    const names = await this.directory.list(AUTOSAVE_DIRECTORY)
    if (!names.includes(SESSION_START_FILE)) {
      await this.directory.writeFile(`${AUTOSAVE_DIRECTORY}/${SESSION_START_FILE}`, bytes)
    }
  }

  async isRecoverable(): Promise<boolean> {
    return (await this.rollingSnapshotNames()).length > 0
  }

  async restore(): Promise<Project | undefined> {
    const bytes = await this.newestSnapshotBytes()
    // A snapshot is a stored project document, so read it the way a project load does: through the
    // codec, which migrates an older snapshot forward rather than trusting its raw shape.
    return bytes === undefined ? undefined : openDecodedDocument(bytes, this.codec).project
  }

  /** The codec's verdict on the newest snapshot, or undefined when none exists. */
  async restoreDecoded(): Promise<DecodeResult | undefined> {
    const bytes = await this.newestSnapshotBytes()
    return bytes === undefined ? undefined : decodeDocument(bytes, this.codec)
  }

  /** Moves each rolling snapshot that does not decode to the backups; resolves with the count. */
  async setAsideRefused(): Promise<number> {
    const names = await this.rollingSnapshotNames()
    return setAsideRefusedSnapshots(
      this.directory,
      this.codec,
      names.map((name) => `${AUTOSAVE_DIRECTORY}/${name}`),
    )
  }

  private async newestSnapshotBytes(): Promise<Uint8Array | undefined> {
    const [newest] = await this.rollingNamesNewestFirst()
    return newest === undefined
      ? undefined
      : this.directory.readFile(`${AUTOSAVE_DIRECTORY}/${newest}`)
  }

  /**
   * Deletes the files this store wrote, including the session-start snapshot. This is the full
   * clear performed on an explicit save, distinct from the internal rolling-cap prune. Any other
   * file in the autosave directory, such as a backup an earlier build left there, stays.
   */
  async prune(): Promise<void> {
    const names = await this.directory.list(AUTOSAVE_DIRECTORY)
    for (const name of names.filter((candidate) => this.isSnapshotFile(candidate))) {
      await this.directory.removeFile(`${AUTOSAVE_DIRECTORY}/${name}`)
    }
  }

  /**
   * Whether prune deletes the file: the session-start snapshot or a name of the exact form
   * `snapshot-<anything>.json`. This is narrower than the rolling rule below on purpose, so that a
   * foreign file such as `snapshot-notes.txt` survives a prune.
   */
  private isSnapshotFile(name: string): boolean {
    return (
      name === SESSION_START_FILE ||
      (name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(SNAPSHOT_SUFFIX))
    )
  }

  /** The names with the snapshot prefix, which is the rule that isRecoverable counts by. */
  private async rollingSnapshotNames(): Promise<string[]> {
    const names = await this.directory.list(AUTOSAVE_DIRECTORY)
    return names.filter((name) => name.startsWith(SNAPSHOT_PREFIX))
  }

  /**
   * Well-formed rolling snapshot names sorted newest first. Foreign or stale files whose
   * timestamp is not a finite number are excluded so they never affect sort, prune, or
   * newest-snapshot selection.
   */
  private async rollingNamesNewestFirst(): Promise<string[]> {
    const names = await this.rollingSnapshotNames()
    return names
      .filter((name) => Number.isFinite(this.timestampOf(name)))
      .sort((left, right) => this.timestampOf(right) - this.timestampOf(left))
  }

  private async pruneOldestRollingSnapshots(): Promise<void> {
    // The new snapshot is already written, and removing old ones is housekeeping. A fault in the
    // listing or in a removal must not fail the write: a document save and a close follow every
    // snapshot write. The pass logs once, with the first error, however many removals fail.
    let firstError: unknown
    let failureCount = 0
    try {
      const ordered = await this.rollingNamesNewestFirst()
      for (const name of ordered.slice(this.maxSnapshots)) {
        try {
          await this.directory.removeFile(`${AUTOSAVE_DIRECTORY}/${name}`)
        } catch (error) {
          failureCount += 1
          firstError ??= error
        }
      }
    } catch (error) {
      failureCount += 1
      firstError ??= error
    }
    if (failureCount > 0) {
      console.error(`${failureCount} step(s) of the old snapshot cleanup failed`, firstError)
    }
  }

  private timestampOf(name: string): number {
    return Number(name.slice(SNAPSHOT_PREFIX.length, name.length - SNAPSHOT_SUFFIX.length))
  }
}
