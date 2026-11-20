import { vi, type MockInstance } from 'vitest'

/** Shared set-up of the tests that must not reach the browser: its storage and its media queries. */

/** The calls that the browser storage of the test run received. */
export interface EmptyBrowserStorage {
  readonly reads: MockInstance<Storage['getItem']>
  readonly writes: MockInstance<Storage['setItem']>
  readonly removals: MockInstance<Storage['removeItem']>
}

/**
 * Makes the browser storage of the test run answer that it holds nothing and keeps nothing, so that
 * no case passes through what an earlier case left there. The spies are restored by
 * `vi.restoreAllMocks`.
 */
export function stubEmptyBrowserStorage(): EmptyBrowserStorage {
  return {
    reads: vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null),
    writes: vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined),
    removals: vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined),
  }
}

/** Makes `matchMedia` match a dark colour scheme query when `prefersDark` is true, and no other. */
export function mockMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}
