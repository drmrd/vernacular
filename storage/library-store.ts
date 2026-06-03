import type { AssetReference } from '../core'

export interface LibraryItemSummary {
  reference: AssetReference
  name: string
}

export interface LibraryStore {
  list(): Promise<LibraryItemSummary[]>
  resolve(reference: AssetReference): Promise<Uint8Array>
}
