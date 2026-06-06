import type { Project } from '../../core'
import { migrateProject } from '../../core'
import type { DirectoryPort } from '../fs/directory-port'
import { parseProjectJson, serializeProjectJson } from '../folder/project-json'

const AUTOSAVE_DIR = '.house-autosave'
const SESSION_START_FILE = 'session-start.json'
const SNAPSHOT_PREFIX = 'snapshot-'
const SNAPSHOT_SUFFIX = '.json'
const DEFAULT_MAX_SNAPSHOTS = 5

export interface SnapshotStoreOptions {
  /** Rolling snapshots kept besides the session-start snapshot. Default 5. */
  maxSnapshots?: number
  /** Injected for deterministic snapshot timestamps. Default Date.now. */
  now?: () => number
}

/**
 * Writes crash-recovery snapshots into a sidecar autosave directory: one
 * session-start snapshot plus a capped, rolling series of timestamped snapshots.
 */
export class SnapshotStore {
  private readonly maxSnapshots: number
  private readonly now: () => number

  constructor(
    private readonly directory: DirectoryPort,
    options?: SnapshotStoreOptions,
  ) {
    this.maxSnapshots = options?.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    this.now = options?.now ?? Date.now
  }

  async writeSnapshot(project: Project): Promise<void> {
    const bytes = serializeProjectJson(project)
    await this.ensureSessionStart(bytes)
    await this.directory.writeFile(
      `${AUTOSAVE_DIR}/${SNAPSHOT_PREFIX}${this.now()}${SNAPSHOT_SUFFIX}`,
      bytes,
    )
    await this.pruneOldestRollingSnapshots()
  }

  private async ensureSessionStart(bytes: Uint8Array): Promise<void> {
    const names = await this.directory.list(AUTOSAVE_DIR)
    if (!names.includes(SESSION_START_FILE)) {
      await this.directory.writeFile(`${AUTOSAVE_DIR}/${SESSION_START_FILE}`, bytes)
    }
  }

  async isRecoverable(): Promise<boolean> {
    return (await this.rollingSnapshotNames()).length > 0
  }

  async restore(): Promise<Project | undefined> {
    const [newest] = await this.rollingNamesNewestFirst()
    if (newest === undefined) {
      return undefined
    }
    const bytes = await this.directory.readFile(`${AUTOSAVE_DIR}/${newest}`)
    if (bytes === undefined) {
      return undefined
    }
    // A snapshot is a stored project document, so read it the way a project load does:
    // validate and migrate an older snapshot forward rather than trust its raw shape.
    return migrateProject(parseProjectJson(bytes))
  }

  /**
   * Deletes every autosave file, including the session-start snapshot. This is the full
   * clear performed on an explicit save, distinct from the internal rolling-cap prune.
   */
  async prune(): Promise<void> {
    const names = await this.directory.list(AUTOSAVE_DIR)
    for (const name of names) {
      await this.directory.removeFile(`${AUTOSAVE_DIR}/${name}`)
    }
  }

  private async rollingSnapshotNames(): Promise<string[]> {
    const names = await this.directory.list(AUTOSAVE_DIR)
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
    const ordered = await this.rollingNamesNewestFirst()
    for (const name of ordered.slice(this.maxSnapshots)) {
      await this.directory.removeFile(`${AUTOSAVE_DIR}/${name}`)
    }
  }

  private timestampOf(name: string): number {
    return Number(name.slice(SNAPSHOT_PREFIX.length, name.length - SNAPSHOT_SUFFIX.length))
  }
}
