import type { Project } from '../../core'
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
    const names = await this.directory.list(AUTOSAVE_DIR)
    if (!names.includes(SESSION_START_FILE)) {
      await this.directory.writeFile(`${AUTOSAVE_DIR}/${SESSION_START_FILE}`, bytes)
    }
    await this.directory.writeFile(
      `${AUTOSAVE_DIR}/${SNAPSHOT_PREFIX}${this.now()}${SNAPSHOT_SUFFIX}`,
      bytes,
    )
    await this.pruneRollingSnapshots()
  }

  async isRecoverable(): Promise<boolean> {
    return (await this.rollingSnapshotNames()).length > 0
  }

  async restore(): Promise<Project | undefined> {
    const newest = this.newestRollingSnapshotName(await this.rollingSnapshotNames())
    if (newest === undefined) {
      return undefined
    }
    const bytes = await this.directory.readFile(`${AUTOSAVE_DIR}/${newest}`)
    if (bytes === undefined) {
      return undefined
    }
    return parseProjectJson(bytes) as Project
  }

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

  private async pruneRollingSnapshots(): Promise<void> {
    const names = await this.rollingSnapshotNames()
    const ordered = [...names].sort(
      (left, right) => this.timestampOf(right) - this.timestampOf(left),
    )
    for (const name of ordered.slice(this.maxSnapshots)) {
      await this.directory.removeFile(`${AUTOSAVE_DIR}/${name}`)
    }
  }

  private newestRollingSnapshotName(names: string[]): string | undefined {
    if (names.length === 0) {
      return undefined
    }
    return [...names].sort((left, right) => this.timestampOf(right) - this.timestampOf(left))[0]
  }

  private timestampOf(name: string): number {
    return Number(name.slice(SNAPSHOT_PREFIX.length, name.length - SNAPSHOT_SUFFIX.length))
  }
}
