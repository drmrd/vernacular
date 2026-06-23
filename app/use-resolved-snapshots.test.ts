import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useResolvedSnapshots } from './use-resolved-snapshots'
import type { SnapshotsPort } from './app'

// A SnapshotsPort-shaped stand-in: the four methods the app depends on, each a
// spy. The hook only needs to pass the port through (sync) or resolve it
// (async); it never invokes these methods, so the bodies stay inert.
function makeSnapshots(): SnapshotsPort {
  return {
    writeSnapshot: vi.fn<(...args: never[]) => Promise<void>>(async () => {}),
    prune: vi.fn<() => Promise<void>>(async () => {}),
    isRecoverable: vi.fn<() => Promise<boolean>>(async () => false),
    restore: vi.fn<() => Promise<undefined>>(async () => undefined),
  }
}

describe('useResolvedSnapshots', () => {
  it('returns the injected port immediately and never calls the resolver', () => {
    const injected = makeSnapshots()
    const resolveSnapshots = vi.fn(() => Promise.resolve(makeSnapshots()))

    const { result } = renderHook(() => useResolvedSnapshots(injected, resolveSnapshots))

    expect(result.current).toBe(injected)
    expect(resolveSnapshots).not.toHaveBeenCalled()
  })

  it('returns undefined first, then the resolved port once the promise settles', async () => {
    const resolved = makeSnapshots()
    const resolveSnapshots = vi.fn(() => Promise.resolve(resolved))

    const { result } = renderHook(() => useResolvedSnapshots(undefined, resolveSnapshots))

    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe(resolved))
    expect(resolveSnapshots).toHaveBeenCalledTimes(1)
  })

  it('returns undefined when neither a port nor a resolver is provided', () => {
    const { result } = renderHook(() => useResolvedSnapshots(undefined, undefined))

    expect(result.current).toBeUndefined()
  })
})
