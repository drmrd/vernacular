import type { AssetReference } from '../../core'

export type ModelStatus = 'loading' | 'ready' | 'failed'

export interface ModelEntry<TModel> {
  status: ModelStatus
  template?: TModel
}

export interface ModelCacheDeps<TModel> {
  resolve: (ref: AssetReference, signal: AbortSignal) => Promise<Uint8Array | undefined>
  parse: (bytes: Uint8Array) => Promise<TModel>
  dispose: (model: TModel) => void
  maxConcurrent?: number
  maxTemplates?: number
}

export interface FurnitureModelCache<TModel> {
  request(ref: AssetReference): void
  get(contentHash: string): ModelEntry<TModel> | undefined
  onChange(listener: () => void): () => void
  markLiveHashes(hashes: Iterable<string>): void
  dispose(): void
}

const DEFAULT_MAX_CONCURRENT = 4
const DEFAULT_MAX_TEMPLATES = 128

interface CacheState<TModel> {
  deps: ModelCacheDeps<TModel>
  entries: Map<string, ModelEntry<TModel>>
  listeners: Set<() => void>
  queue: AssetReference[]
  inFlight: number
  maxConcurrent: number
  liveHashes: Set<string>
  maxTemplates: number
  disposed: boolean
  abortController: AbortController
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
    const bytes = await state.deps.resolve(ref, state.abortController.signal)
    if (state.disposed) return
    if (bytes === undefined) {
      settleFailed(state, ref, new Error(`No bytes resolved for ${ref.contentHash}`))
      return
    }
    const template = await state.deps.parse(bytes)
    if (state.disposed) {
      state.deps.dispose(template)
      return
    }
    state.entries.set(ref.contentHash, { status: 'ready', template })
    notify(state)
  } catch (error) {
    if (state.disposed) return
    settleFailed(state, ref, error)
  } finally {
    state.inFlight -= 1
    if (!state.disposed) pump(state)
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

function countReady<TModel>(state: CacheState<TModel>): number {
  let count = 0
  for (const entry of state.entries.values()) {
    if (entry.status === 'ready') count += 1
  }
  return count
}

function oldestEvictable<TModel>(
  state: CacheState<TModel>,
): [string, ModelEntry<TModel>] | undefined {
  for (const [hash, entry] of state.entries) {
    if (entry.status === 'ready' && !state.liveHashes.has(hash)) return [hash, entry]
  }
  return undefined
}

function evict<TModel>(state: CacheState<TModel>): void {
  let readyCount = countReady(state)
  while (readyCount > state.maxTemplates) {
    const victim = oldestEvictable(state)
    if (victim === undefined) break
    const [hash, entry] = victim
    if (entry.template !== undefined) state.deps.dispose(entry.template)
    state.entries.delete(hash)
    readyCount -= 1
  }
}

function disposeCache<TModel>(state: CacheState<TModel>): void {
  state.disposed = true
  state.abortController.abort()
  state.listeners.clear()
  for (const entry of state.entries.values()) {
    if (entry.status === 'ready' && entry.template !== undefined) state.deps.dispose(entry.template)
  }
  state.entries.clear()
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
    liveHashes: new Set(),
    maxTemplates: deps.maxTemplates ?? DEFAULT_MAX_TEMPLATES,
    disposed: false,
    abortController: new AbortController(),
  }
  return {
    request(ref) {
      if (state.disposed) return
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
    markLiveHashes(hashes) {
      state.liveHashes = new Set(hashes)
      evict(state)
    },
    dispose() {
      disposeCache(state)
    },
  }
}
