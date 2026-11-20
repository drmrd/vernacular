/** The limits that an imported project archive must stay within. Equal to a limit is allowed. */
export interface ArchiveLimits {
  /** The length of the archive file. */
  readonly archiveBytes: number
  /** The sum of the declared inflated sizes of every entry. */
  readonly inflatedBytes: number
  /** The count of entries in the central directory. */
  readonly entries: number
  /** The declared inflated size of the document entry. */
  readonly documentBytes: number
}

export type ArchiveLimitName = keyof ArchiveLimits

/** 512 MiB. */
const MAXIMUM_ARCHIVE_BYTES = 536_870_912
/** 1 GiB. */
const MAXIMUM_INFLATED_BYTES = 1_073_741_824
const MAXIMUM_ENTRIES = 10_000
/** 64 MiB. */
const MAXIMUM_DOCUMENT_BYTES = 67_108_864

/** The limits of the archive reader when the caller gives none. */
export const ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  archiveBytes: MAXIMUM_ARCHIVE_BYTES,
  inflatedBytes: MAXIMUM_INFLATED_BYTES,
  entries: MAXIMUM_ENTRIES,
  documentBytes: MAXIMUM_DOCUMENT_BYTES,
})
