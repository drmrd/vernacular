import { describe, expect, it } from 'vitest'
import { unzipFolder, zipFolder, type FolderEntries } from './zip-codec'

describe('zip codec', () => {
  it('round-trips folder entries including nested paths', () => {
    const encode = new TextEncoder()
    const entries: FolderEntries = new Map([
      ['project.json', encode.encode('{"meta":{}}')],
      ['.house-autosave/snap.json', encode.encode('{"snapshot":true}')],
    ])

    const result = unzipFolder(zipFolder(entries))

    expect(result).toEqual(entries)
    expect(result.get('project.json')).toEqual(encode.encode('{"meta":{}}'))
  })

  it('round-trips an empty folder to an empty map', () => {
    const result = unzipFolder(zipFolder(new Map()))

    expect(result.size).toBe(0)
  })

  it('throws when unzipping bytes that are not a zip archive', () => {
    const notAZip = new TextEncoder().encode('this is not a zip')

    expect(() => unzipFolder(notAZip)).toThrow()
  })
})
