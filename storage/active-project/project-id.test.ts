import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidProjectId, newProjectId } from './project-id'

const SAMPLE_UUID = '3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f'
const MAX_ID_LENGTH = 64

afterEach(() => {
  vi.restoreAllMocks()
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
