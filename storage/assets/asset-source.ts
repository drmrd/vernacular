import type { AssetReference } from '../../core'

/**
 * A read seam over one place assets live (a pack, the user library, the project
 * folder, the content cache). The narrowed, byte-returning form of the design
 * specification section 4.1 source: this slice needs only identity and read.
 * The wider source surface (manifest, thumbnail, write, delete) lands with the
 * library browser and custom-import slices.
 */
export interface AssetSource {
  readonly id: string
  read(contentHash: string): Promise<Uint8Array | undefined>
}

/** Re-exported for callers that build a source keyed off a reference's hash. */
export type { AssetReference }
