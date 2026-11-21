import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLegacyActiveProjectId, removeLegacyActiveProjectId } from './legacy-active-project-id'
import {
  clearLegacyActiveProjectId,
  legacyActiveProjectIdIsStored,
  plantLegacyActiveProjectId,
  storedLegacyActiveProjectId,
} from './legacy-active-project-id-test-kit'

const REMEMBERED_ID = 'project-3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f'
const OVERLONG_LENGTH = 200

/** The ways in which the browser storage can refuse a call, and how a test makes it refuse. */
const REFUSALS: readonly (readonly [string, (method: 'getItem' | 'removeItem') => void])[] = [
  [
    'the storage throws',
    (method) =>
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('the storage is not available')
      }),
  ],
  ['the storage is missing', () => vi.stubGlobal('localStorage', undefined)],
]

beforeEach(() => {
  clearLegacyActiveProjectId()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearLegacyActiveProjectId()
})

describe('the read of the id that the first stage remembered', () => {
  it('gives the stored id and leaves it stored', () => {
    plantLegacyActiveProjectId(REMEMBERED_ID)

    expect(readLegacyActiveProjectId()).toBe(REMEMBERED_ID)

    expect(storedLegacyActiveProjectId()).toBe(REMEMBERED_ID)
  })

  it('gives the same id at a second read', () => {
    plantLegacyActiveProjectId('current')

    expect([readLegacyActiveProjectId(), readLegacyActiveProjectId()]).toEqual([
      'current',
      'current',
    ])
  })

  it('gives undefined when nothing is stored', () => {
    expect(readLegacyActiveProjectId()).toBeUndefined()
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it.each([
    ['a path traversal', '../x'],
    ['an empty string', ''],
    ['a value with a space', 'my project'],
    ['an overlong string', 'x'.repeat(OVERLONG_LENGTH)],
  ])('gives undefined for a value that is not a valid id (%s), and removes it', (_label, value) => {
    plantLegacyActiveProjectId(value)

    expect(readLegacyActiveProjectId()).toBeUndefined()

    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it.each(REFUSALS)('gives undefined, and does not throw, when %s', (_way, refuse) => {
    plantLegacyActiveProjectId(REMEMBERED_ID)
    refuse('getItem')

    expect(readLegacyActiveProjectId()).toBeUndefined()
  })
})

describe('the removal of the id that the first stage remembered', () => {
  it('removes the stored id, and a read after it gives undefined', () => {
    plantLegacyActiveProjectId(REMEMBERED_ID)

    removeLegacyActiveProjectId()

    expect(legacyActiveProjectIdIsStored()).toBe(false)
    expect(readLegacyActiveProjectId()).toBeUndefined()
  })

  it('does not throw when nothing is stored', () => {
    expect(() => removeLegacyActiveProjectId()).not.toThrow()
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it.each(REFUSALS)('does not throw when %s', (_way, refuse) => {
    plantLegacyActiveProjectId(REMEMBERED_ID)
    refuse('removeItem')

    expect(() => removeLegacyActiveProjectId()).not.toThrow()
  })
})
