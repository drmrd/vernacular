import type { MigrateOptions } from '../../migrations/migrate'
import type { Project } from '../../model/types'
import type { FormatFault } from '../current-schema'

export type { FormatFault }

/** Why stored bytes did not decode to a document. */
export type DecodeFailure =
  /** The bytes are not UTF-8 JSON. */
  | { readonly kind: 'not-json'; readonly message: string }
  /** The JSON has no meta object with an integer `schemaVersion`. */
  | { readonly kind: 'not-a-project' }
  /** The stored version is above the version of this build. */
  | { readonly kind: 'newer-version'; readonly version: number; readonly buildVersion: number }
  /** A migration step threw or is missing; `fromVersion` is always the schema version of the stored document. */
  | { readonly kind: 'migration-failed'; readonly fromVersion: number; readonly message: string }
  /**
   * The migrated document breaks the format rules; `document` is the migrated document. It is
   * `unknown` because the document failed the check, so it is not known to be a `Project`.
   */
  | {
      readonly kind: 'format-rules'
      readonly faults: readonly FormatFault[]
      readonly document: unknown
      readonly migratedFrom: number | undefined
    }

/** A stored document that decoded to a project. */
export interface DecodedDocument {
  readonly project: Project
  /** The stored version when a migration ran; undefined when the file was already current. */
  readonly migratedFrom: number | undefined
  /** True when the file's revision is above this build's, so it was read tolerantly. */
  readonly savedByNewerBuild: boolean
}

/** The outcome of decoding stored bytes. */
export type DecodeResult =
  | { readonly ok: true; readonly value: DecodedDocument }
  | { readonly ok: false; readonly failure: DecodeFailure }

/** Options of the codec. */
export interface CodecOptions {
  /**
   * The one source of migration for the codec. `migrateProject` reads it, so a test that injects a
   * step changes what is run. Defaults to `{}`: the registered schema and registry steps, and the
   * current schema version as the target. The codec passes it on unchanged and holds no
   * `targetVersion` of its own.
   */
  readonly migration?: MigrateOptions
}

/** Every way that stored bytes can fail to be read, before the schema check runs. */
export type ReadFailure = Exclude<DecodeFailure, { readonly kind: 'format-rules' }>

/** Why encode wrote with no graft: the previous bytes failed to decode this way. */
export type GraftDropped = ReadFailure

/** The bytes of an encoded document; `faults` is empty when the document passes. */
export interface EncodedDocument {
  /** Returned whether or not the document passes the check: a fault never blocks a save. */
  readonly bytes: Uint8Array
  readonly faults: readonly FormatFault[]
  /** Set when the previous bytes could not be read, so no unknown data was grafted. */
  readonly graftDropped?: GraftDropped
}
