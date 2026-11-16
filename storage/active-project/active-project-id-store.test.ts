import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryActiveProjectIdStore,
  LocalStorageActiveProjectIdStore,
  isValidProjectId,
  newProjectId,
  type ActiveProjectIdStore,
} from './active-project-id-store'

const STORAGE_KEY = 'vernacular.activeProjectId'
const SAMPLE_UUID = '3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f'
const OVERLONG_LENGTH = 200
const MAX_ID_LENGTH = 64

const implementations: ReadonlyArray<[string, () => ActiveProjectIdStore]> = [
  ['InMemoryActiveProjectIdStore', () => new InMemoryActiveProjectIdStore()],
  ['LocalStorageActiveProjectIdStore', () => new LocalStorageActiveProjectIdStore()],
]

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(implementations)('%s', (_name, create) => {
  it('reads undefined when nothing was written', async () => {
    await expect(create().read()).resolves.toBeUndefined()
  })

  it('reads back the id that was written', async () => {
    const store = create()

    await store.write('project-abc')

    await expect(store.read()).resolves.toBe('project-abc')
  })

  it('reads the latest id after a second write', async () => {
    const store = create()

    await store.write('current')
    await store.write('project-abc')

    await expect(store.read()).resolves.toBe('project-abc')
  })
})

describe('LocalStorageActiveProjectIdStore with a damaged or unavailable browser storage', () => {
  it.each([
    ['a path traversal', '../x'],
    ['an empty string', ''],
    ['an overlong string', 'x'.repeat(OVERLONG_LENGTH)],
    ['a value with a space', 'my project'],
  ])('reads undefined when the stored value is %s', async (_label, stored) => {
    localStorage.setItem(STORAGE_KEY, stored)

    await expect(new LocalStorageActiveProjectIdStore().read()).resolves.toBeUndefined()
  })

  it('reads undefined, without rejecting, when getItem throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is unavailable')
    })

    await expect(new LocalStorageActiveProjectIdStore().read()).resolves.toBeUndefined()
  })

  it('rejects the write when setItem throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    await expect(new LocalStorageActiveProjectIdStore().write('project-abc')).rejects.toThrow()
  })
})

describe('isValidProjectId', () => {
  it.each([
    ['the default id', 'current'],
    ['a generated id', `project-${SAMPLE_UUID}`],
    ['a single digit', '7'],
    ['the longest allowed id', 'a'.repeat(MAX_ID_LENGTH)],
  ])('accepts %s', (_label, id) => {
    expect(isValidProjectId(id)).toBe(true)
  })

  it.each([
    ['an empty string', ''],
    ['a path traversal', '../x'],
    ['a leading hyphen', '-project'],
    ['a space', 'my project'],
    ['a slash', 'a/b'],
    ['an id one character too long', 'a'.repeat(MAX_ID_LENGTH + 1)],
  ])('rejects %s', (_label, id) => {
    expect(isValidProjectId(id)).toBe(false)
  })
})

describe('newProjectId', () => {
  it('returns a valid id made of "project-" and a UUID', () => {
    const id = newProjectId([])

    expect(isValidProjectId(id)).toBe(true)
    expect(id).toMatch(/^project-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('never returns a member of the existing ids', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(SAMPLE_UUID)

    const id = newProjectId([`project-${SAMPLE_UUID}`, 'current'])

    expect(id).not.toBe(`project-${SAMPLE_UUID}`)
  })

  it('returns different ids on repeated calls', () => {
    expect(newProjectId([])).not.toBe(newProjectId([]))
  })
})
