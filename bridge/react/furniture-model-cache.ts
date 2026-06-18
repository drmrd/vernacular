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
  maxConcurrent?: number
}

export interface FurnitureModelCache<TModel> {
  request(ref: AssetReference): void
  get(contentHash: string): ModelEntry<TModel> | undefined
  onChange(listener: () => void): () => void
}

const DEFAULT_MAX_CONCURRENT = 4

interface CacheState<TModel> {
  deps: ModelCacheDeps<TModel>
  entries: Map<string, ModelEntry<TModel>>
  listeners: Set<() => void>
  queue: AssetReference[]
  inFlight: number
  maxConcurrent: number
}

function notify<TModel>(state: CacheState<TModel>): void {
  for (const listener of state.listeners) listener()
}

function settleFailed<TModel>(
  state: CacheState<TModel>,
  ref: AssetReference,
  reason: unknown,
): void {
  state.entries.set(ref.contentHash, { status: 'failed' })
  console.warn(`Failed to load furniture model ${ref.contentHash}`, reason)
  notify(state)
}

async function runLoad<TModel>(state: CacheState<TModel>, ref: AssetReference): Promise<void> {
  try {
    const bytes = await state.deps.resolve(ref)
    if (bytes === undefined) {
      settleFailed(state, ref, new Error(`No bytes resolved for ${ref.contentHash}`))
      return
    }
    const template = await state.deps.parse(bytes)
    state.entries.set(ref.contentHash, { status: 'ready', template })
    notify(state)
  } catch (error) {
    settleFailed(state, ref, error)
  } finally {
    state.inFlight -= 1
    pump(state)
  }
}

function pump<TModel>(state: CacheState<TModel>): void {
  while (state.inFlight < state.maxConcurrent) {
    const ref = state.queue.shift()
    if (ref === undefined) break
    state.inFlight += 1
    void runLoad(state, ref)
  }
}

export function createFurnitureModelCache<TModel>(
  deps: ModelCacheDeps<TModel>,
): FurnitureModelCache<TModel> {
  const state: CacheState<TModel> = {
    deps,
    entries: new Map(),
    listeners: new Set(),
    queue: [],
    inFlight: 0,
    maxConcurrent: deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
  }
  return {
    request(ref) {
      if (state.entries.has(ref.contentHash)) return
      state.entries.set(ref.contentHash, { status: 'loading' })
      state.queue.push(ref)
      pump(state)
    },
    get(contentHash) {
      return state.entries.get(contentHash)
    },
    onChange(listener) {
      state.listeners.add(listener)
      return () => {
        state.listeners.delete(listener)
      }
    },
  }
}
