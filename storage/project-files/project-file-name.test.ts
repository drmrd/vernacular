import { describe, expect, it } from 'vitest'
import { secondDocumentFileName, secondDocumentFileVersion } from './project-file-name'

const VERSION = 17

describe('the name of a second document file', () => {
  it('names the second file of a schema version', () => {
    expect(secondDocumentFileName(VERSION)).toBe('vernacular.format-17.json')
  })

  it('reads the schema version back from the name of a second file', () => {
    expect(secondDocumentFileVersion('vernacular.format-17.json')).toBe(VERSION)
  })

  it('gives back the version that it was made from', () => {
    expect(secondDocumentFileVersion(secondDocumentFileName(VERSION))).toBe(VERSION)
  })

  it.each([
    'vernacular.json',
    'vernacular.format-.json',
    'vernacular.format-0.json',
    'vernacular.format-017.json',
    'vernacular.format-1e2.json',
    'vernacular.format-17.JSON',
    'Vernacular.format-17.json',
    'vernacular.format-17.json.bak',
    'a/vernacular.format-17.json',
  ])('finds no version in the name %s', (name) => {
    expect(secondDocumentFileVersion(name)).toBeUndefined()
  })
})
