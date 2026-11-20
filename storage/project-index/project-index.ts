import type { ProjectLocation } from '../project-files/project-location'

/** What the workspace knows of one project without opening it. */
export interface ProjectRecord {
  readonly id: string
  readonly location: ProjectLocation
  readonly name: string | undefined
  readonly floorCount: number | undefined
  readonly preview: string | undefined // SVG text, shown through an image element
  readonly assetHashes: readonly string[]
  readonly assetListComplete: boolean // false after a best-effort read
  readonly lastChangedAt: string | undefined // from the store
  readonly lastUsedAt: string | undefined // an open or a save
  /** `reason` is the kind of the decode or open failure. */
  readonly lastOpen: { readonly opened: boolean; readonly build: string; readonly reason?: string }
}

/** One record for each project, readable before any project loads. */
export interface ProjectIndex {
  /** Every record, ordered by id. */
  all(): Promise<ProjectRecord[]>
  /** The record of the id, or undefined when there is none. */
  get(id: string): Promise<ProjectRecord | undefined>
  /** Stores the record under its id, in place of any record that was there. */
  put(record: ProjectRecord): Promise<void>
  /** Removes the record of the id. Resolves when there is none. */
  remove(id: string): Promise<void>
}
