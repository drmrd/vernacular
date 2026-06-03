export interface AssetCache {
  has(contentHash: string): Promise<boolean>
  get(contentHash: string): Promise<Uint8Array | undefined>
  put(contentHash: string, bytes: Uint8Array): Promise<void>
}
