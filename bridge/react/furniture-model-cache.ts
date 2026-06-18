import type { AssetReference } from '../../core'

export type ModelStatus = 'loading' | 'ready' | 'failed'

export interface ModelEntry<TModel> {
  status: ModelStatus
  template?: TModel
}

export interface ModelCacheDeps<TModel> {
  resolve: (ref: AssetReference) => Promise<Uint8Array | undefined>
  parse: (bytes: Uint8Array) => Promise<TModel>
  dispose: (model: TModel) => void
}

export interface FurnitureModelCache<TModel> {
  request(ref: AssetReference): void
  get(contentHash: string): ModelEntry<TModel> | undefined
  onChange(listener: () => void): () => void
}

export function createFurnitureModelCache<TModel>(
  deps: ModelCacheDeps<TModel>,
): FurnitureModelCache<TModel> {
  const entries = new Map<string, ModelEntry<TModel>>()
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  async function load(ref: AssetReference): Promise<void> {
    const bytes = await deps.resolve(ref)
    if (bytes === undefined) return
    const template = await deps.parse(bytes)
    entries.set(ref.contentHash, { status: 'ready', template })
    notify()
  }

  return {
    request(ref) {
      entries.set(ref.contentHash, { status: 'loading' })
      void load(ref)
    },
    get(contentHash) {
      return entries.get(contentHash)
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
